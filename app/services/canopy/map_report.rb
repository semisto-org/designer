module Canopy
  # The trees already standing on and around a map, from the global canopy
  # height map (Providers::CanopyHeight): a grid of heights over the
  # outline's bounding box plus a margin, for the overlay, and what it says
  # inside the outline: the tallest tree, the share of the terrain under
  # canopy, the area of tall trees, and when the imagery was taken.
  #
  # Output keys are camelCase (JSON for the frontend and the MCP).
  #
  #   { available: true,
  #     grid: { width:, height:, cellM:, bounds: { west:, south:, east:, north: }, data: <base64 Uint8, metres> },
  #     stats: { terrainAreaM2:, maxHeightM:, canopyAreaM2:, canopyShare:, meanCanopyHeightM:, tallAreaM2: },
  #     thresholds: { canopyM: 3, tallM: 10 },
  #     imagery: { from: "2018-09-27", to: "2019-05-14" } | nil,
  #     source: { key:, attribution:, licence:, url: } }
  #   { available: false, reason: "not_configured" | "no_outline" | "too_large" | "no_coverage" | "upstream_error" }
  class MapReport
    MARGIN_M = 30
    CANOPY_M = 3
    TALL_M = 10
    METRES_PER_DEGREE = 111_320.0

    def initialize(map, provider: nil)
      @map = map
      @provider = provider || Providers::CanopyHeight.build
    end

    def window
      return @window if defined?(@window)

      @window = @provider.window(**bounds)
    end

    def as_json(*)
      @as_json ||= build
    end

    private
      def build
        return unavailable("not_configured") unless @provider.available?
        return unavailable("no_outline") unless outline
        return unavailable("no_coverage") unless window.covered

        {
          available: true,
          grid: grid_json,
          stats: stats,
          thresholds: { canopyM: CANOPY_M, tallM: TALL_M },
          imagery: window.dates && { from: window.dates.first, to: window.dates.last },
          source: { key: "meta_chm_v2", attribution: @provider.attribution, licence: Providers::CanopyHeight::LICENCE,
                    url: Providers::CanopyHeight::INFO_URL }
        }
      rescue Providers::CanopyHeight::TooLarge
        unavailable("too_large")
      rescue Providers::CanopyHeight::Unavailable => e
        Rails.logger.warn("[canopy] map #{@map.id}: #{e.message}")
        unavailable("upstream_error")
      end

      def unavailable(reason) = { available: false, reason: }

      def outline
        boundary = @map.boundary
        boundary if boundary && !boundary.empty?
      end

      # The outline's bounding box and a margin around it, in degrees.
      def bounds
        west, south, east, north = @map.bbox
        lat = (south + north) / 2
        d_lat = MARGIN_M / METRES_PER_DEGREE
        d_lng = MARGIN_M / (METRES_PER_DEGREE * Math.cos(lat * Math::PI / 180))
        { west: west - d_lng, south: south - d_lat, east: east + d_lng, north: north + d_lat }
      end

      def grid_json
        west, south, east, north = window.bounds
        {
          width: window.width, height: window.height,
          cellM: (window.cell_size * Math.cos((south + north) / 2 * Math::PI / 180)).round(2),
          bounds: { west:, south:, east:, north: },
          data: Base64.strict_encode64(window.heights)
        }
      end

      # Area-weighted figures over the cells whose centre is inside the outline.
      def stats
        heights, maxima = window.heights.bytes, window.maxima.bytes
        terrain = canopy = tall = canopy_height = 0.0
        tallest = 0
        inside_cells do |row, col, area|
          index = row * window.width + col
          height = heights[index]
          terrain += area
          tallest = maxima[index] if maxima[index] > tallest
          next unless height >= CANOPY_M

          canopy += area
          canopy_height += height * area
          tall += area if height >= TALL_M
        end
        {
          terrainAreaM2: terrain.round, maxHeightM: tallest,
          canopyAreaM2: canopy.round, canopyShare: terrain.positive? ? (canopy / terrain).round(3) : 0,
          meanCanopyHeightM: canopy.positive? ? (canopy_height / canopy).round(1) : nil,
          tallAreaM2: tall.round
        }
      end

      # Yields (row, col, ground area in m²) for each cell of the window
      # whose centre is inside the outline (even-odd rule over all rings,
      # scanline per row, in grid coordinates).
      def inside_cells
        min_x, _min_y, _max_x, max_y = window.mercator
        size = window.cell_size
        edges = rings.flat_map do |ring|
          points = ring.map do |lng, lat|
            x, y = Relief::Mercator.forward(lng, lat)
            [ (x - min_x) / size, (max_y - y) / size ]
          end
          points.each_cons(2).to_a
        end
        window.height.times do |row|
          cy = row + 0.5
          y = max_y - cy * size
          scale = 1 / Math.cosh(y / Relief::Mercator::EARTH_RADIUS)
          area = (size * scale)**2
          crossings = edges.filter_map do |(x1, y1), (x2, y2)|
            next if (y1 > cy) == (y2 > cy)

            x1 + (cy - y1) * (x2 - x1) / (y2 - y1)
          end.sort
          crossings.each_slice(2) do |from, to|
            next unless to

            first = [ (from - 0.5).ceil, 0 ].max
            last = [ (to - 0.5).ceil - 1, window.width - 1 ].min
            (first..last).each { |col| yield row, col, area }
          end
        end
      end

      # Every ring of the outline (outer and holes), as closed [lng, lat] lists.
      def rings
        polygons = outline.geometry_type == RGeo::Feature::MultiPolygon ? outline.to_a : [ outline ]
        polygons.flat_map do |polygon|
          [ polygon.exterior_ring, *polygon.interior_rings ].map { |ring| ring.points.map { [ _1.x, _1.y ] } }
        end
      end
  end
end
