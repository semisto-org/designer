module Relief
  # Lines parallel to a keyline, every `spacing_m` metres above and below it,
  # clipped to the map's boundary. Only the keyline itself follows the
  # contour: its parallels keep its shape, so above it they drift down
  # towards the ridges and below it they rise towards them. Swales, trees or
  # subsoiling along them carry the water of the valley out onto the drier
  # ridges (P.A. Yeomans' keyline pattern).
  #
  # Offsets are taken in metres in Web Mercator (scaled by the latitude);
  # which side is upslope is read on the terrain.
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

      result = (1..@above).flat_map { |k| offset(up * k * @spacing, "above", k) } +
        (1..@below).flat_map { |k| offset(-up * k * @spacing, "below", k) }
      debug_empty(up) if result.empty? && ENV["CI"] # TEMP
      result
    end

    # TEMP: CI-only diagnostic.
    def debug_empty(up)
      d = up * @spacing
      moved = offset_vertices(d * mercator_scale)
      wkt2 = "LINESTRING(#{moved.map { |x, y| "#{x} #{y}" }.join(',')})"
      warn "DBG wkt=#{wkt} scale=#{mercator_scale} pts=#{mercator_points.inspect} moved=#{moved.inspect}"
      warn "DBG boundary=#{@map.reload.boundary&.as_text}"
      sql = "SELECT ST_AsText(ST_Transform(ST_SetSRID(ST_GeomFromText($1), 3857), 4326)) t, ST_Distance(ST_Transform(ST_SetSRID(ST_GeomFromText($1), 3857), 4326)::geography, ST_GeomFromText($2, 4326)::geography) dist, postgis_full_version() v"
      warn "DBG sql=#{Map.connection.select_all(sql, 'dbg', [ wkt2, wkt ]).to_a.inspect}"
      warn "DBG curves=#{curves(d).inspect}"
    rescue => e
      warn "DBG error #{e.class}: #{e.message}"
    end

    private
      def wkt = @feature.geometry.as_text

      # +1 when the ground rises on the left of the line (ST_OffsetCurve's
      # positive side), -1 on the right, nil when both sides are level. Read
      # PROBE_M to each side of every segment's middle, along its normal.
      def upslope_sign
        scale = mercator_scale
        points = mercator_points
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

      # Pieces of the line offset by `distance` metres (positive on the left),
      # clipped to the boundary. Each vertex moves along the bisector of its
      # two segments' normals; PostGIS then nodes the line and drops the
      # loops that sharp bends leave on their inner side (closer to the
      # keyline than `distance`). No ST_OffsetCurve: its results differ
      # between GEOS versions.
      def curves(distance)
        moved = offset_vertices(distance * mercator_scale)
        return [] if moved.size < 2

        sql = <<~SQL.squish
          WITH source AS (SELECT ST_GeomFromText($1, 4326) AS g),
          moved AS (SELECT ST_Transform(ST_SetSRID(ST_GeomFromText($2), 3857), 4326) AS g),
          noded AS (SELECT (ST_Dump(ST_UnaryUnion(g))).geom AS g FROM moved),
          kept AS (
            SELECT ST_LineMerge(ST_Collect(noded.g)) AS g FROM noded, source
            WHERE ST_Distance(noded.g::geography, source.g::geography) >= $3 * 0.9
          ),
          clipped AS (
            SELECT CASE WHEN m.boundary IS NULL THEN kept.g ELSE ST_LineMerge(ST_Intersection(kept.g, m.boundary)) END AS g
            FROM kept, maps m WHERE m.id = $4 AND kept.g IS NOT NULL
          ),
          parts AS (SELECT (ST_Dump(g)).geom AS g FROM clipped)
          SELECT ST_AsGeoJSON(ST_Simplify(g, 0.0000005), 7) AS geometry, ST_Length(g::geography) AS length_m,
                 ST_AsGeoJSON(ST_LineInterpolatePoints(g, 0.1)) AS samples
          FROM parts WHERE GeometryType(g) = 'LINESTRING'
        SQL
        wkt = "LINESTRING(#{moved.map { |x, y| "#{x} #{y}" }.join(',')})"
        Map.connection.select_all(sql, "parallels", [ self.wkt, wkt, distance.abs, @map.id ]).map do |row|
          { geometry: JSON.parse(row["geometry"]), length_m: row["length_m"].to_f, samples: points(JSON.parse(row["samples"])) }
        end
      end

      def mercator_scale
        @mercator_scale ||= 1 / Math.cos(@feature.geometry.points.sum(&:y) / @feature.geometry.num_points * Math::PI / 180)
      end

      def mercator_points
        @mercator_points ||= @feature.geometry.points.map { |pt| Mercator.forward(pt.x, pt.y) }
          .chunk_while { |a, b| a == b }.map(&:first)
      end

      # The keyline's vertices moved `d` (Mercator units) to the left of the
      # line, along the bisector of the adjacent segments' normals; the miter
      # is capped at twice the distance.
      def offset_vertices(d)
        pts = mercator_points
        normals = pts.each_cons(2).map do |(x0, y0), (x1, y1)|
          length = Math.hypot(x1 - x0, y1 - y0)
          [ -(y1 - y0) / length, (x1 - x0) / length ]
        end
        return [] if normals.empty?

        pts.each_with_index.map do |(x, y), i|
          before = normals[i - 1] if i.positive?
          after = normals[i]
          nx, ny =
            if before && after
              bx = before[0] + after[0]
              by = before[1] + after[1]
              norm = Math.hypot(bx, by)
              if norm < 1e-9
                after
              else
                bx /= norm
                by /= norm
                miter = 1 / [ bx * after[0] + by * after[1], 0.5 ].max
                [ bx * miter, by * miter ]
              end
            else
              before || after
            end
          [ x + nx * d, y + ny * d ]
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
