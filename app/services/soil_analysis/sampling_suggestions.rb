module SoilAnalysis
  # Proposes where to take soil samples on a terrain.
  #
  # The idea: one sample should stand for a zone of comparable size, away from
  # what would skew it. So:
  #   1. the terrain outline is shrunk by `edge_margin` meters (field edges,
  #      hedges and ditches are not representative);
  #   2. buildings, water and paths are removed, with `obstacle_margin` meters
  #      around them (foundations, rubble, pooled run-off, compaction);
  #   3. what is left is covered with a fine grid of candidate points, and the
  #      candidates are split into N compact groups of comparable size (the grid
  #      is walked along a Hilbert curve and cut in N equal pieces, then the
  #      groups are tidied by k-means: the result is repeatable);
  #   4. the point proposed for each group is the candidate nearest to its
  #      centre, so it always lies in the usable area.
  # Points already placed (`existing`) count as already-covered zones: they
  # stay where they are and new points are spread around them.
  #
  # Everything is computed in meters on a local flat projection around the
  # terrain (accurate to centimeters at the scale of a plot).
  class SamplingSuggestions
    METERS_PER_DEGREE_LAT = 110_540.0
    METERS_PER_DEGREE_LNG = 111_320.0
    MAX_CANDIDATES = 4_000
    MAX_POINTS = 30
    # Side of the square grid the Hilbert curve walks (a power of two, larger
    # than any candidate grid: at most MAX_CANDIDATES cells in total).
    HILBERT_SIZE = 4096

    Result = Struct.new(:points, :usable_area_m2, :candidates, keyword_init: true)
    Point = Struct.new(:lng, :lat, :rank, keyword_init: true)

    PLANAR = RGeo::Geos.factory(srid: 0)
    WGS84 = GeoJsonGeometry::FACTORY

    # boundary: RGeo (multi)polygon in WGS84; obstacles / existing: RGeo geometries in WGS84.
    def initialize(boundary:, obstacles: [], existing: [], count: 5, edge_margin: 5.0, obstacle_margin: 3.0)
      @boundary = boundary
      @obstacles = obstacles
      @existing = existing
      @count = count.to_i.clamp(1, MAX_POINTS)
      @edge_margin = edge_margin.to_f
      @obstacle_margin = obstacle_margin.to_f
    end

    def call
      return Result.new(points: [], usable_area_m2: 0.0, candidates: 0) if @boundary.nil? || @boundary.empty?
      @lng0, @lat0 = reference_point
      usable = usable_area
      return Result.new(points: [], usable_area_m2: 0.0, candidates: 0) if usable.nil? || usable.empty?

      candidates = grid_candidates(usable)
      return Result.new(points: [], usable_area_m2: usable.area.round(1), candidates: 0) if candidates.empty?

      fixed = @existing.filter_map { |geometry| project_point(geometry) }
      centers = pick_centers(candidates, fixed)
      points = centers.each_with_index.map do |(x, y), index|
        lng, lat = unproject(x, y)
        Point.new(lng: lng.round(7), lat: lat.round(7), rank: index + 1)
      end
      Result.new(points:, usable_area_m2: usable.area.round(1), candidates: candidates.size)
    end

    private
      def reference_point
        c = @boundary.centroid
        [ c.x, c.y ]
      end

      def project(geometry)
        case geometry.geometry_type
        when RGeo::Feature::Point then PLANAR.point(*to_xy(geometry.x, geometry.y))
        when RGeo::Feature::LineString then PLANAR.line_string(geometry.points.map { |p| PLANAR.point(*to_xy(p.x, p.y)) })
        when RGeo::Feature::LinearRing then PLANAR.linear_ring(geometry.points.map { |p| PLANAR.point(*to_xy(p.x, p.y)) })
        when RGeo::Feature::Polygon
          PLANAR.polygon(project(geometry.exterior_ring), geometry.interior_rings.map { |ring| project(ring) })
        when RGeo::Feature::MultiPolygon then PLANAR.multi_polygon(geometry.map { |g| project(g) })
        when RGeo::Feature::GeometryCollection, RGeo::Feature::MultiLineString, RGeo::Feature::MultiPoint
          PLANAR.collection(geometry.map { |g| project(g) })
        end
      end

      def to_xy(lng, lat)
        [ (lng - @lng0) * Math.cos(@lat0 * Math::PI / 180) * METERS_PER_DEGREE_LNG, (lat - @lat0) * METERS_PER_DEGREE_LAT ]
      end

      def unproject(x, y)
        [ @lng0 + x / (Math.cos(@lat0 * Math::PI / 180) * METERS_PER_DEGREE_LNG), @lat0 + y / METERS_PER_DEGREE_LAT ]
      end

      def project_point(geometry)
        point = geometry.geometry_type == RGeo::Feature::Point ? geometry : geometry.centroid
        to_xy(point.x, point.y)
      end

      # Terrain minus margins. A very small terrain keeps a smaller margin
      # rather than no suggestion at all.
      def usable_area
        terrain = project(@boundary)
        obstacles = @obstacles.filter_map do |geometry|
          next if geometry.nil? || geometry.empty?
          projected = project(geometry)
          projected&.buffer(@obstacle_margin)
        end
        blocked = obstacles.reduce { |union, shape| union.union(shape) }
        [ @edge_margin, @edge_margin / 2, 0.0 ].each do |margin|
          area = margin.positive? ? terrain.buffer(-margin) : terrain
          area = area.difference(blocked) if blocked
          return area unless area.nil? || area.empty? || area.area < 1.0
        end
        nil
      end

      def grid_candidates(area)
        envelope = area.envelope
        xs = envelope.exterior_ring.points.map(&:x)
        ys = envelope.exterior_ring.points.map(&:y)
        step = [ Math.sqrt(area.area / (@count * 40.0)), 1.5 ].max
        step = [ step, 25.0 ].min
        step *= 1.25 while (((xs.max - xs.min) / step) + 1) * (((ys.max - ys.min) / step) + 1) > MAX_CANDIDATES
        @origin = [ xs.min + step / 2, ys.min + step / 2 ]
        @step = step
        points = []
        x = xs.min + step / 2
        while x <= xs.max
          y = ys.min + step / 2
          while y <= ys.max
            points << [ x, y ] if area.contains?(PLANAR.point(x, y))
            y += step
          end
          x += step
        end
        # A narrow strip can slip between grid lines: fall back on the centroid.
        points << representative(area) if points.empty?
        points
      end

      def representative(area)
        point = area.point_on_surface
        [ point.x, point.y ]
      end

      # Centers seeded from equal pieces of the Hilbert-ordered grid (compact
      # and balanced), then k-means on the candidate grid. Already placed
      # samples are fixed centers; only the new ones move. Every center is a
      # candidate, so it lies in the usable area.
      def pick_centers(candidates, fixed)
        wanted = [ @count, candidates.size ].min
        ordered = candidates.sort_by { |x, y| hilbert_index(((x - @origin[0]) / @step).round, ((y - @origin[1]) / @step).round) }
        centers = fixed.dup
        first_free = centers.size
        wanted.times do |index|
          piece = ordered[(index * ordered.size / wanted)...((index + 1) * ordered.size / wanted)]
          centers << nearest_to(piece, centroid_of(piece))
        end
        20.times do
          groups = Hash.new { |hash, key| hash[key] = [] }
          candidates.each { |candidate| groups[nearest_index(centers, candidate)] << candidate }
          moved = false
          (first_free...centers.size).each do |index|
            members = groups[index]
            next if members.empty?
            target = nearest_to(members, centroid_of(members))
            moved ||= target != centers[index]
            centers[index] = target
          end
          break unless moved
        end
        centers.drop(first_free).uniq
      end

      # Position along the Hilbert curve of the cell (x, y) of a square grid.
      def hilbert_index(x, y)
        n = HILBERT_SIZE
        d = 0
        s = n / 2
        while s.positive?
          rx = (x & s).positive? ? 1 : 0
          ry = (y & s).positive? ? 1 : 0
          d += s * s * ((3 * rx) ^ ry)
          if ry.zero?
            if rx == 1
              x = n - 1 - x
              y = n - 1 - y
            end
            x, y = y, x
          end
          s /= 2
        end
        d
      end

      def centroid_of(points)
        [ points.sum(&:first) / points.size, points.sum(&:last) / points.size ]
      end

      def nearest_to(points, target)
        points.min_by { |x, y| [ (x - target[0])**2 + (y - target[1])**2, y, x ] }
      end

      def nearest_index(centers, point)
        centers.each_index.min_by { |i| (centers[i][0] - point[0])**2 + (centers[i][1] - point[1])**2 }
      end
  end
end
