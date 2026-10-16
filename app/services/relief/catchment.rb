module Relief
  # The catchment of a water element (pond, swale, rain garden) or of a point:
  # the ground whose runoff ends up there. A pond is sized on the area that
  # drains into it, not on its own surface.
  #
  # Each cell drains to its steepest lower neighbour (D8). A cell with no
  # lower neighbour (a pit, a flat) drains where a priority-flood (Barnes,
  # Lehman & Mulla 2014, as the « Écoulement » layer of the editor,
  # app/frontend/relief/hydro.ts) says its water spills. The catchment is then
  # walked upstream from the element: every cell whose water reaches it. So a
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

    KINDS = %w[pond swale rain_garden].freeze
    # Cells the flood works on: a 1 m grid of a large map is averaged by
    # blocks down to this budget (a catchment at 2 m is still precise).
    MAX_CELLS = 300_000
    EPSILON = 1e-5

    Result = Data.define(:geometry, :area_m2, :inside_boundary_m2, :beyond_relief, :cell_size_m,
                         :capacity_m3, :fill_rain_mm, :annual_rain_m3, :annual_rainfall_mm) do
      def as_json(*)
        {
          geometry:, areaM2: area_m2, insideBoundaryM2: inside_boundary_m2, beyondRelief: beyond_relief,
          cellSizeM: cell_size_m, capacityM3: capacity_m3, fillRainMm: fill_rain_mm,
          annualRainM3: annual_rain_m3, annualRainfallMm: annual_rainfall_mm
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
        [ "relief/catchment/v1", @terrain.id, @terrain.version, @map.boundary && Digest::SHA1.hexdigest(@map.boundary.as_text)[0, 12], settings, *target ]
      end

      def compute
        load_grid
        targets = target_cells
        raise Error, :outside_relief if targets.empty?

        inside = upstream(targets, drainage)
        cells = (0...@n).select { |i| inside[i] }
        area = cells.size * @cell_m**2
        boundary_mask = @map.boundary ? Mask.for_geometry(@map.boundary, @extent) : nil
        inside_boundary = boundary_mask ? cells.count { |i| boundary_mask.getbyte(i) == 1 } * @cell_m**2 : area
        capacity = @feature&.water_capacity_m3
        rainfall = @map.effective_water_settings["annual_rainfall_mm"]&.to_f

        Result.new(
          geometry: outline(inside),
          area_m2: area.round,
          inside_boundary_m2: inside_boundary.round,
          beyond_relief: cells.any? { |i| edge?(i) },
          cell_size_m: @cell_m.round(2),
          capacity_m3: capacity&.round(1),
          fill_rain_mm: capacity && area.positive? ? (capacity / area * 1000).round : nil,
          annual_rain_m3: rainfall ? (area * rainfall / 1000).round : nil,
          annual_rainfall_mm: rainfall
        )
      end

      # Heights averaged by blocks of `@factor` × `@factor` (nil = no data),
      # on an extent whose cells are the blocks.
      def load_grid
        cols = @terrain.cols
        rows = @terrain.rows
        raw = @raw || @terrain.grid.download.unpack("v*")
        nodata = @terrain.nodata || Raster::NODATA
        z_min = @terrain.z_min.to_f
        z_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        @factor = Math.sqrt(cols * rows / MAX_CELLS.to_f).ceil.clamp(1, 100)
        @cols = cols / @factor
        @rows = rows / @factor
        @n = @cols * @rows
        @cell_m = @terrain.cell_size_m.to_f * @factor
        half = (@factor - 1) / 2.0 * @terrain.step
        @extent = Extent.new(
          west: @terrain.west + half, north: @terrain.north - half, step: @terrain.step * @factor,
          cols: @cols, rows: @rows, lat0: @terrain.lat0.to_f, cell_size_m: @cell_m, margin_m: @terrain.margin_m.to_f
        )
        @heights = Array.new(@n)
        @rows.times do |r|
          @cols.times do |c|
            sum = 0
            count = 0
            @factor.times do |dr|
              base = (r * @factor + dr) * cols + c * @factor
              @factor.times do |dc|
                v = raw[base + dc]
                next if v.nil? || v == nodata

                sum += v
                count += 1
              end
            end
            @heights[r * @cols + c] = count.zero? ? nil : z_min + sum.to_f / count * z_unit
          end
        end
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
            [ @feature.geometry.as_text, line ? [ width / 2, radius ].max : radius ]
          else
            [ "POINT(#{@lng} #{@lat})", radius ]
          end
        wkt = Map.connection.select_value(
          "SELECT ST_AsText(ST_Buffer(ST_GeomFromText($1, 4326)::geography, $2)::geometry)", "catchment", [ geometry, radius ]
        )
        GeoJsonGeometry::FACTORY.parse_wkt(wkt)
      end

      def edge?(i)
        c = i % @cols
        r = i / @cols
        return true if c.zero? || r.zero? || c == @cols - 1 || r == @rows - 1

        [ i - 1, i + 1, i - @cols, i + @cols ].any? { |j| @heights[j].nil? }
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

      NEIGHBOURS = [ -1, 0, 1 ].product([ -1, 0, 1 ]).reject { |d| d == [ 0, 0 ] }.map { |dc, dr| [ dc, dr, Math.hypot(dc, dr) ] }.freeze

      # The downstream cell of each cell (-1 where water leaves the relief).
      def drainage
        receiver = flood_receivers
        cols = @cols
        rows = @rows
        @n.times do |i|
          h = @heights[i]
          next unless h

          c = i % cols
          r = i / cols
          best = nil
          steepest = 0.0
          NEIGHBOURS.each do |dc, dr, distance|
            cc = c + dc
            rr = r + dr
            next if cc.negative? || rr.negative? || cc >= cols || rr >= rows

            j = rr * cols + cc
            other = @heights[j]
            next unless other

            slope = (h - other) / distance
            if slope > steepest
              steepest = slope
              best = j
            end
          end
          receiver[i] = best if best
        end
        receiver
      end

      # Where each cell spills once the depressions are filled from the
      # borders: the cell that reached it in the flood. Borders and cells next
      # to missing data are outlets (-1): water leaves the known relief there.
      def flood_receivers
        filled = Array.new(@n)
        receiver = Array.new(@n, -1)
        seen = Array.new(@n, false)
        heap = MinHeap.new
        @n.times do |i|
          next unless @heights[i]
          next unless edge?(i)

          seen[i] = true
          filled[i] = @heights[i]
          heap.push(i, @heights[i])
        end
        cols = @cols
        rows = @rows
        until heap.empty?
          i = heap.pop
          c = i % cols
          r = i / cols
          level = filled[i] + EPSILON
          NEIGHBOURS.each do |dc, dr, _|
            cc = c + dc
            rr = r + dr
            next if cc.negative? || rr.negative? || cc >= cols || rr >= rows

            j = rr * cols + cc
            next if seen[j]

            h = @heights[j]
            next unless h

            seen[j] = true
            receiver[j] = i
            filled[j] = h > level ? h : level
            heap.push(j, filled[j])
          end
        end
        receiver
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

      # A binary heap of cell indices keyed by their filled height.
      class MinHeap
        def initialize
          @keys = []
          @items = []
        end

        def empty? = @items.empty?

        def push(item, key)
          i = @items.size
          @keys << key
          @items << item
          while i.positive?
            parent = (i - 1) >> 1
            break if @keys[parent] <= key

            @keys[i] = @keys[parent]
            @items[i] = @items[parent]
            i = parent
          end
          @keys[i] = key
          @items[i] = item
        end

        def pop
          top = @items[0]
          key = @keys.pop
          item = @items.pop
          size = @items.size
          return top if size.zero?

          i = 0
          loop do
            child = 2 * i + 1
            break if child >= size

            child += 1 if child + 1 < size && @keys[child + 1] < @keys[child]
            break if @keys[child] >= key

            @keys[i] = @keys[child]
            @items[i] = @items[child]
            i = child
          end
          @keys[i] = key
          @items[i] = item
          top
        end
      end
  end
end
