module Relief
  # The catchment of a water element (pond, swale, rain garden, half-moon, a
  # structure across the flow) or of a point:
  # the ground whose runoff ends up there. A pond is sized on the area that
  # drains into it, not on its own surface.
  #
  # Drainage comes from Relief::FlowGrid (D8 with a priority-flood through
  # pits and flats). The catchment is walked upstream from the element: every cell whose water reaches it. So a
  # pond at the bottom of a hollow gathers the whole hollow, and a swale on
  # the contour the slope above it.
  #
  # The relief covers the boundary plus a margin: when the catchment touches
  # the edge of the grid, it goes on beyond it and its area is a minimum
  # (`beyond_relief`).
  class Catchment
    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("relief.catchment.errors.#{key}"))
      end
    end

    KINDS = %w[pond swale keyline rain_garden half_moon check_dam fascine beaver_dam_analogue hedge_bank].freeze
    # An infiltration test this close speaks for the element's soil; farther,
    # the median of the map's tests stands in.
    NEARBY_TEST_M = 50

    Result = Data.define(:geometry, :area_m2, :inside_boundary_m2, :beyond_relief, :cell_size_m,
                         :capacity_m3, :fill_rain_mm, :annual_rain_m3, :annual_rainfall_mm,
                         :infiltration_mm_h, :infiltration_distance_m, :empties_in_h) do
      def as_json(*)
        {
          geometry:, areaM2: area_m2, insideBoundaryM2: inside_boundary_m2, beyondRelief: beyond_relief,
          cellSizeM: cell_size_m, capacityM3: capacity_m3, fillRainMm: fill_rain_mm,
          annualRainM3: annual_rain_m3, annualRainfallMm: annual_rainfall_mm,
          infiltrationMmH: infiltration_mm_h, infiltrationDistanceM: infiltration_distance_m, emptiesInH: empties_in_h
        }
      end
    end

    def self.applies_to?(feature) = KINDS.include?(feature.kind)

    # A feature, or a point (lng/lat) for a place where nothing is drawn yet.
    def initialize(map, feature: nil, lng: nil, lat: nil, heights: nil)
      @map = map
      @terrain = map.terrain
      @feature = feature
      @lng = lng&.to_f
      @lat = lat&.to_f
      @raw = heights
    end

    def call
      raise Error, :no_relief unless @terrain&.ready? && @terrain.grid.attached?
      raise Error, :not_water if @feature && !self.class.applies_to?(@feature)

      Rails.cache.fetch(cache_key, expires_in: 1.week) { compute }
    end

    private
      def cache_key
        target = @feature ? [ @feature.id, @feature.lock_version ] : [ @lng.round(6), @lat.round(6) ]
        settings = @map.effective_water_settings.slice("annual_rainfall_mm")
        tests = Digest::SHA1.hexdigest(@map.infiltration_measurements.to_json)[0, 12]
        [ "relief/catchment/v2", @terrain.id, @terrain.version, @map.boundary && Digest::SHA1.hexdigest(@map.boundary.as_text)[0, 12], settings, tests, *target ]
      end

      def compute
        load_grid
        targets = target_cells
        raise Error, :outside_relief if targets.empty?

        inside = upstream(targets, @grid.receivers)
        cells = (0...@n).select { |i| inside[i] }
        area = cells.size * @cell_m**2
        boundary_mask = @map.boundary ? Mask.for_geometry(@map.boundary, @extent) : nil
        inside_boundary = boundary_mask ? cells.count { |i| boundary_mask.getbyte(i) == 1 } * @cell_m**2 : area
        capacity = @feature&.water_capacity_m3
        rainfall = @map.effective_water_settings["annual_rainfall_mm"]&.to_f
        infiltration, distance = measured_infiltration
        depth = @feature&.properties.to_h["depth_m"].to_f
        empties = infiltration&.positive? && depth.positive? && dug? ? (depth * 1000 / infiltration).round(1) : nil

        Result.new(
          geometry: outline(inside),
          area_m2: area.round,
          inside_boundary_m2: inside_boundary.round,
          beyond_relief: cells.any? { |i| @grid.edge?(i) },
          cell_size_m: @cell_m.round(2),
          capacity_m3: capacity&.round(1),
          fill_rain_mm: capacity && area.positive? ? (capacity / area * 1000).round : nil,
          annual_rain_m3: rainfall ? (area * rainfall / 1000).round : nil,
          annual_rainfall_mm: rainfall,
          infiltration_mm_h: infiltration,
          infiltration_distance_m: distance,
          empties_in_h: empties
        )
      end

      # A swale, rain garden or half-moon holds water in a hollow; a keyline only when it is dug as a swale.
      def dug?
        return %w[swale rain_garden half_moon].include?(@feature.kind) unless @feature.kind == "keyline"

        [ nil, "", "swale" ].include?(@feature.properties.to_h["use"])
      end

      def load_grid
        @grid = FlowGrid.new(@terrain, heights: @raw)
        @heights = @grid.heights
        @cols = @grid.cols
        @rows = @grid.rows
        @n = @grid.n
        @cell_m = @grid.cell_m
        @extent = @grid.extent
      end

      # The rate (mm/h) of the nearest infiltration test within
      # NEARBY_TEST_M, with its distance, else the median of the map's tests
      # (distance nil), else nil.
      def measured_infiltration
        return nil unless @feature

        rates = @map.infiltration_measurements
        return nil if rates.empty?

        nearest = @map.features.active.where(id: rates.map { |r| r[:id] })
          .select(MapFeature.sanitize_sql_array([ "map_features.*, ST_Distance(map_features.geometry::geography, (SELECT geometry FROM map_features WHERE id = ?)::geography) AS distance_m", @feature.id ]))
          .order("distance_m").first
        return [ nearest.infiltration_rate_mm_h, nearest.distance_m.round ] if nearest && nearest.distance_m <= NEARBY_TEST_M

        sorted = rates.map { |r| r[:rateMmH] }.sort
        mid = sorted.size / 2
        [ (sorted.size.odd? ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).round(1), nil ]
      end

      # Grid cells under the element: its surface, its line widened to its
      # width, or a disc around a point; never less than about one cell.
      def target_cells
        Mask.for_geometry(target_area, @extent).each_byte.with_index.filter_map { |byte, i| i if byte == 1 && @heights[i] }
      end

      def target_area
        radius = @cell_m * 0.75
        geometry, radius =
          if @feature
            line = @feature.geometry.geometry_type == RGeo::Feature::LineString
            width = @feature.properties.to_h["width_m"].to_f
            width = @feature.properties.to_h["diameter_m"].to_f unless line
            [ @feature.geometry.as_text, [ width / 2, radius ].max ]
          else
            [ "POINT(#{@lng} #{@lat})", radius ]
          end
        wkt = Map.connection.select_value(
          "SELECT ST_AsText(ST_Buffer(ST_GeomFromText($1, 4326)::geography, $2)::geometry)", "catchment", [ geometry, radius ]
        )
        GeoJsonGeometry::FACTORY.parse_wkt(wkt)
      end

      # Every cell whose water reaches one of `targets`.
      def upstream(targets, receiver)
        donors = Array.new(@n)
        receiver.each_with_index do |to, i|
          next if to.negative?

          (donors[to] ||= []) << i
        end
        inside = Array.new(@n, false)
        queue = targets.dup
        targets.each { |i| inside[i] = true }
        until queue.empty?
          i = queue.pop
          donors[i]&.each do |j|
            next if inside[j]

            inside[j] = true
            queue << j
          end
        end
        inside
      end

      # The catchment's outline: runs of cells row by row, stacked when they
      # repeat, merged and simplified by PostGIS.
      def outline(inside)
        boxes = []
        open = {}
        @rows.times do |r|
          runs = []
          c = 0
          while c < @cols
            if inside[r * @cols + c]
              start = c
              c += 1 while c < @cols && inside[r * @cols + c]
              runs << [ start, c - 1 ]
            else
              c += 1
            end
          end
          current = {}
          runs.each do |run|
            current[run] = open.delete(run) || r
          end
          open.each { |(a, b), top| boxes << [ a, b, top, r - 1 ] }
          open = current
        end
        open.each { |(a, b), top| boxes << [ a, b, top, @rows - 1 ] }

        polygons = boxes.map do |a, b, top, bottom|
          west, north = corner(a - 0.5, top - 0.5)
          east, south = corner(b + 0.5, bottom + 0.5)
          "((#{west} #{south},#{east} #{south},#{east} #{north},#{west} #{north},#{west} #{south}))"
        end
        json = Map.connection.select_value(<<~SQL.squish, "catchment", [ "MULTIPOLYGON(#{polygons.join(',')})", @extent.step * 0.4 / 111_320 ])
          SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_GeomFromText($1, 4326)), $2), 7)
        SQL
        JSON.parse(json)
      end

      def corner(c, r)
        Mercator.inverse(@extent.west + c * @extent.step, @extent.north - r * @extent.step).map { |v| v.round(8) }
      end
  end
end
