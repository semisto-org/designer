module Relief
  # Lines parallel to a keyline, every `spacing_m` metres above and below it,
  # clipped to the map's boundary. Only the keyline itself follows the
  # contour: its parallels keep its shape, so above it they drift down
  # towards the ridges and below it they rise towards them. Swales, trees or
  # subsoiling along them carry the water of the valley out onto the drier
  # ridges (P.A. Yeomans' keyline pattern).
  #
  # Offsets are taken in metres in Web Mercator (scaled by the latitude) by
  # PostGIS; which side is upslope is read on the terrain.
  class Parallels
    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("relief.parallels.errors.#{key}"))
      end
    end

    MAX_PER_SIDE = 10
    SPACING_M = (1.0..100.0)
    # Pieces shorter than this (a corner of the boundary) are dropped.
    MIN_LENGTH_M = 5.0
    # How far from the keyline its sides are sampled to find the slope.
    PROBE_M = 4.0

    Line = Data.define(:geometry, :offset_m, :side, :rank, :length_m, :fall_m) do
      def as_json(*) = { geometry:, offsetM: offset_m, side:, rank:, lengthM: length_m, fallM: fall_m }
    end

    def initialize(map, feature:, spacing_m:, above:, below:, heights: nil)
      @map = map
      @terrain = map.terrain
      @feature = feature
      @spacing = spacing_m.to_f
      @above = above.to_i.clamp(0, MAX_PER_SIDE)
      @below = below.to_i.clamp(0, MAX_PER_SIDE)
      @raw = heights
    end

    def call
      raise Error, :not_keyline unless @feature.kind == "keyline" && @feature.geometry.geometry_type == RGeo::Feature::LineString
      raise Error, :spacing unless SPACING_M.cover?(@spacing)
      raise Error, :no_relief unless @terrain&.ready? && @terrain.grid.attached?

      @raw ||= @terrain.grid.download.unpack("v*")
      up = upslope_sign
      raise Error, :flat unless up

      (1..@above).flat_map { |k| offset(up * k * @spacing, "above", k) } +
        (1..@below).flat_map { |k| offset(-up * k * @spacing, "below", k) }
    end

    private
      def wkt = @feature.geometry.as_text

      # +1 when the ground rises on the left of the line (ST_OffsetCurve's
      # positive side), -1 on the right, nil when both sides are level. Read
      # PROBE_M to each side of every segment's middle, along its normal.
      def upslope_sign
        scale = 1 / Math.cos(@feature.geometry.points.sum(&:y) / @feature.geometry.num_points * Math::PI / 180)
        points = @feature.geometry.points.map { |pt| Mercator.forward(pt.x, pt.y) }
        left = []
        right = []
        points.each_cons(2) do |(x0, y0), (x1, y1)|
          length = Math.hypot(x1 - x0, y1 - y0)
          next if length.zero?

          mx = (x0 + x1) / 2
          my = (y0 + y1) / 2
          nx = -(y1 - y0) / length * PROBE_M * scale
          ny = (x1 - x0) / length * PROBE_M * scale
          left << height_at(*Mercator.inverse(mx + nx, my + ny))
          right << height_at(*Mercator.inverse(mx - nx, my - ny))
        end
        left = left.compact
        right = right.compact
        return nil if left.empty? || right.empty?

        difference = left.sum / left.size - right.sum / right.size
        return nil if difference.abs <= 0.02

        difference.positive? ? 1 : -1
      end

      # Pieces of the line offset by `distance` metres, clipped to the boundary.
      def curves(distance)
        sql = <<~SQL.squish
          WITH line AS (SELECT ST_GeomFromText($1, 4326) AS g),
          moved AS (
            SELECT ST_Transform(ST_OffsetCurve(ST_Transform(g, 3857), $2 / cos(radians(ST_Y(ST_Centroid(g)))), 'join=round quad_segs=4'), 4326) AS g
            FROM line
          ),
          clipped AS (
            SELECT ST_LineMerge(CASE WHEN m.boundary IS NULL THEN moved.g ELSE ST_Intersection(moved.g, m.boundary) END) AS g
            FROM moved, maps m WHERE m.id = $3
          ),
          parts AS (SELECT (ST_Dump(g)).geom AS g FROM clipped)
          SELECT ST_AsGeoJSON(g, 7) AS geometry, ST_Length(g::geography) AS length_m,
                 ST_AsGeoJSON(ST_LineInterpolatePoints(g, 0.1)) AS samples
          FROM parts WHERE GeometryType(g) = 'LINESTRING'
        SQL
        Map.connection.select_all(sql, "parallels", [ wkt, distance, @map.id ]).map do |row|
          { geometry: JSON.parse(row["geometry"]), length_m: row["length_m"].to_f, samples: points(JSON.parse(row["samples"])) }
        end
      end

      def points(geojson) = geojson["type"] == "Point" ? [ geojson["coordinates"] ] : geojson["coordinates"]

      def offset(distance, side, rank)
        curves(distance).filter_map do |curve|
          next if curve[:length_m] < MIN_LENGTH_M

          heights = curve[:samples].filter_map { |lng, lat| height_at(lng, lat) }
          Line.new(
            geometry: curve[:geometry], offset_m: distance.abs.round(2), side:, rank:,
            length_m: curve[:length_m].round(1), fall_m: heights.size > 1 ? (heights.max - heights.min).round(2) : nil
          )
        end
      end

      # The terrain's height at the nearest node, nil off the grid or without data.
      def height_at(lng, lat)
        x, y = Mercator.forward(lng, lat)
        c = ((x - @terrain.west) / @terrain.step).round
        r = ((@terrain.north - y) / @terrain.step).round
        return nil if c.negative? || r.negative? || c >= @terrain.cols || r >= @terrain.rows

        v = @raw[r * @terrain.cols + c]
        return nil if v.nil? || v == (@terrain.nodata || Raster::NODATA)

        @terrain.z_min.to_f + v * (@terrain.z_unit || Raster::Z_UNIT).to_f
      end
  end
end
