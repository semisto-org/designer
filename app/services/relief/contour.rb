module Relief
  # The contour line through a point of the map's terrain: the line where the
  # ground stays at the same height as that point. Swales, keylines and hedges
  # across the slope sit on it; a few tens of centimetres off and a swale
  # becomes a ditch that concentrates water.
  #
  # The heights are lightly smoothed (a mean over about 2 m, so the noise of a
  # 1 m LiDAR grid does not make the line zigzag), then the line is followed
  # square by square from the point, both ways (marching squares, saddles
  # resolved by the square's centre), until it leaves the grid, meets missing
  # data or closes on itself. It is then clipped to the map's boundary, keeping
  # the piece that passes through the point, and simplified.
  class Contour
    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("relief.contour.errors.#{key}"))
      end
    end

    Result = Data.define(:geometry, :elevation_m, :length_m, :closed) do
      def as_json(*) = { geometry:, elevationM: elevation_m, lengthM: length_m, closed: }
    end

    SMOOTHING_M = 2.0
    MAX_STEPS = 400_000
    # Tolerance of the simplification, in cells.
    SIMPLIFY_CELLS = 0.3
    # Edges of a square: 0 top, 1 right, 2 bottom, 3 left. Leaving through an
    # edge enters the neighbour through the opposite one.
    MOVES = { 0 => [ 0, -1, 2 ], 1 => [ 1, 0, 3 ], 2 => [ 0, 1, 0 ], 3 => [ -1, 0, 1 ] }.freeze

    def initialize(map, lng:, lat:, heights: nil)
      @map = map
      @terrain = map.terrain
      @lng = lng.to_f
      @lat = lat.to_f
      @raw = heights
    end

    def call
      raise Error, :no_relief unless @terrain&.ready? && @terrain.grid.attached?
      raise Error, :outside_boundary if @map.boundary && !inside_boundary?

      load_grid
      fc, fr = to_grid(@lng, @lat)
      c0 = fc.floor
      r0 = fr.floor
      raise Error, :outside_relief unless square_inside?(c0, r0) && square_known?(c0, r0)

      @level = bilinear(c0, r0, fc - c0, fr - r0)
      line, closed = follow(c0, r0, fc, fr)
      raise Error, :flat if line.size < 2

      geometry = clip(simplify(line, closed), closed)
      raise Error, :flat unless geometry

      Result.new(geometry:, elevation_m: @level.round(2), length_m: length_m(geometry), closed: geometry["coordinates"].first == geometry["coordinates"].last)
    end

    private
      def inside_boundary?
        Map.where(id: @map.id).where("ST_Covers(boundary, ST_SetSRID(ST_MakePoint(?, ?), 4326))", @lng, @lat).exists?
      end

      def load_grid
        @cols = @terrain.cols
        @rows = @terrain.rows
        @raw ||= @terrain.grid.download.unpack("v*")
        @nodata = @terrain.nodata || Raster::NODATA
        @z_min = @terrain.z_min.to_f
        @z_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        @radius = (SMOOTHING_M / 2 / @terrain.cell_size_m.to_f).round.clamp(1, 3)
        @smooth = {}
      end

      def to_grid(lng, lat)
        x, y = Mercator.forward(lng, lat)
        [ (x - @terrain.west) / @terrain.step, (@terrain.north - y) / @terrain.step ]
      end

      def to_lnglat(c, r)
        lng, lat = Mercator.inverse(@terrain.west + c * @terrain.step, @terrain.north - r * @terrain.step)
        [ lng.round(8), lat.round(8) ]
      end

      # Mean of the known heights around a node; nil where the node itself is missing.
      def height(c, r)
        index = r * @cols + c
        return @smooth[index] if @smooth.key?(index)

        @smooth[index] = begin
          raw = @raw[r * @cols + c]
          if raw.nil? || raw == @nodata
            nil
          else
            sum = 0.0
            count = 0
            ((r - @radius)..(r + @radius)).each do |rr|
              next if rr.negative? || rr >= @rows

              ((c - @radius)..(c + @radius)).each do |cc|
                next if cc.negative? || cc >= @cols

                v = @raw[rr * @cols + cc]
                next if v.nil? || v == @nodata

                sum += v
                count += 1
              end
            end
            @z_min + sum / count * @z_unit
          end
        end
      end

      def square_inside?(c, r) = c >= 0 && r >= 0 && c < @cols - 1 && r < @rows - 1

      def corners(c, r) = [ height(c, r), height(c + 1, r), height(c + 1, r + 1), height(c, r + 1) ]

      def square_known?(c, r) = corners(c, r).none?(&:nil?)

      def bilinear(c, r, u, v)
        tl, tr, br, bl = corners(c, r)
        top = tl + (tr - tl) * u
        bottom = bl + (br - bl) * u
        top + (bottom - top) * v
      end

      # The node pairs of each edge, in the order of `corners`.
      EDGE_CORNERS = { 0 => [ 0, 1 ], 1 => [ 1, 2 ], 2 => [ 3, 2 ], 3 => [ 0, 3 ] }.freeze
      # Offsets of the corners from the square's north-west node.
      CORNER_OFFSETS = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ].freeze

      def crossings(c, r)
        z = corners(c, r)
        above = z.map { |h| h >= @level }
        EDGE_CORNERS.select { |_, (a, b)| above[a] != above[b] }.keys
      end

      # Where the line crosses an edge, in grid coordinates.
      def crossing_point(c, r, edge)
        z = corners(c, r)
        a, b = EDGE_CORNERS[edge]
        t = (@level - z[a]) / (z[b] - z[a])
        ac, ar = CORNER_OFFSETS[a]
        bc, br = CORNER_OFFSETS[b]
        [ c + ac + (bc - ac) * t, r + ar + (br - ar) * t ]
      end

      # The edge the line leaves through, having entered through `entry`.
      def exit_edge(c, r, entry)
        edges = crossings(c, r)
        return nil unless edges.include?(entry)
        return (edges - [ entry ]).first if edges.size == 2

        # A saddle: the centre says which corners the high ground joins.
        z = corners(c, r)
        centre_above = z.sum / 4 >= @level
        pairs = centre_above == (z[0] >= @level) ? [ [ 0, 1 ], [ 2, 3 ] ] : [ [ 0, 3 ], [ 1, 2 ] ]
        (pairs.find { |p| p.include?(entry) } - [ entry ]).first
      end

      # The two edges of the starting square that carry the point's line.
      def start_edges(c0, r0, fc, fr)
        edges = crossings(c0, r0)
        return edges if edges.size == 2
        return nil unless edges.size == 4

        z = corners(c0, r0)
        centre_above = z.sum / 4 >= @level
        pairs = centre_above == (z[0] >= @level) ? [ [ 0, 1 ], [ 2, 3 ] ] : [ [ 0, 3 ], [ 1, 2 ] ]
        pairs.min_by do |pair|
          a, b = pair.map { |e| crossing_point(c0, r0, e) }
          segment_distance([ fc, fr ], a, b)
        end
      end

      # Grid points of the line, and whether it closes on itself.
      def follow(c0, r0, fc, fr)
        first, second = start_edges(c0, r0, fc, fr)
        return [ [], false ] unless first

        forward, closed = walk(c0, r0, second, stop: [ c0, r0 ])
        return [ [ crossing_point(c0, r0, first), crossing_point(c0, r0, second) ] + forward, true ] if closed

        backward, = walk(c0, r0, first, stop: [ c0, r0 ])
        [ backward.reverse + [ crossing_point(c0, r0, first), crossing_point(c0, r0, second) ] + forward, false ]
      end

      # From the square (c, r), leave through `edge` and keep going.
      def walk(c, r, edge, stop:)
        points = []
        MAX_STEPS.times do
          dc, dr, entry = MOVES[edge]
          c += dc
          r += dr
          return [ points, false ] unless square_inside?(c, r) && square_known?(c, r)
          return [ points, true ] if [ c, r ] == stop

          edge = exit_edge(c, r, entry)
          return [ points, false ] unless edge

          points << crossing_point(c, r, edge)
        end
        [ points, false ]
      end

      def segment_distance(p, a, b)
        dx = b[0] - a[0]
        dy = b[1] - a[1]
        len2 = dx * dx + dy * dy
        t = len2.zero? ? 0 : (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0, 1)
        Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
      end

      # Douglas–Peucker on the grid points, then to longitude/latitude.
      def simplify(points, closed)
        points = points.chunk_while { |a, b| a == b }.map(&:first)
        kept = douglas_peucker(points, SIMPLIFY_CELLS)
        kept << kept.first if closed && kept.first != kept.last
        kept.map { |c, r| to_lnglat(c, r) }
      end

      def douglas_peucker(points, tolerance)
        return points if points.size < 3

        keep = Array.new(points.size, false)
        keep[0] = keep[-1] = true
        stack = [ [ 0, points.size - 1 ] ]
        until stack.empty?
          from, to = stack.pop
          next if to - from < 2

          index, distance = ((from + 1)...to).map { |i| [ i, segment_distance(points[i], points[from], points[to]) ] }.max_by(&:last)
          next unless distance > tolerance

          keep[index] = true
          stack << [ from, index ] << [ index, to ]
        end
        points.select.with_index { |_, i| keep[i] }
      end

      # The piece of the line inside the boundary that passes nearest the point.
      def clip(coordinates, closed)
        line = { "type" => "LineString", "coordinates" => coordinates }
        return line unless @map.boundary

        json = Map.connection.select_value(<<~SQL.squish, "contour", [ line.to_json, @map.id, @lng, @lat ])
          SELECT ST_AsGeoJSON(piece, 8) FROM (
            SELECT (ST_Dump(ST_LineMerge(ST_Intersection(m.boundary, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))))).geom AS piece
            FROM maps m WHERE m.id = $2
          ) pieces
          WHERE ST_GeometryType(piece) = 'ST_LineString'
          ORDER BY ST_Distance(piece, ST_SetSRID(ST_MakePoint($3, $4), 4326))
          LIMIT 1
        SQL
        json && JSON.parse(json)
      end

      def length_m(geometry)
        Map.connection.select_value(
          "SELECT ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography)", "contour", [ geometry.to_json ]
        ).to_f.round(1)
      end
  end
end
