module Relief
  # What the relief says about an observation made during a downpour
  # (`kind: storm_observation`): does the water the person saw follow the
  # flow axes the relief predicts, or does something the relief cannot see
  # (a drain, a ditch, wheel ruts, compacted soil) send it elsewhere?
  #
  #   flows  a line drawn downstream: the share of it that runs along a flow
  #          axis (the same axes as the « Écoulement » overlay of the
  #          editor), and how much it falls from start to end.
  #   pools  a surface where water stood: a hollow of the relief, a flat, or
  #          a slope that should have drained it (then the soil holds it).
  #   seeps  a point where water came out of the ground: the area whose
  #          runoff reaches it.
  class StormCheck
    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("relief.storm.errors.#{key}"))
      end
    end

    # Within this distance of a flow axis, a drawn line is on it.
    NEAR_AXIS_M = 4.0
    # Share of a line on the axes for it to follow them.
    FOLLOWS_SHARE = 0.6
    # A line whose end is this much higher than its start goes uphill.
    UPHILL_M = 0.3
    FLAT_SLOPE = 0.01
    HOLLOW_M = 0.05
    NEARBY_TEST_M = 50

    Result = Data.define(:water, :verdict, :share_on_axes, :fall_m, :slope_pct, :hollow_m, :drained_m2,
                         :infiltration_mm_h, :infiltration_distance_m) do
      def as_json(*)
        {
          water:, verdict:, shareOnAxes: share_on_axes, fallM: fall_m, slopePct: slope_pct, hollowM: hollow_m,
          drainedM2: drained_m2, infiltrationMmH: infiltration_mm_h, infiltrationDistanceM: infiltration_distance_m
        }
      end
    end

    def initialize(map, feature:, heights: nil)
      @map = map
      @terrain = map.terrain
      @feature = feature
      @raw = heights
    end

    def call
      raise Error, :not_storm unless @feature.storm_observation?
      raise Error, :no_relief unless @terrain&.ready? && @terrain.grid.attached?

      Rails.cache.fetch(cache_key, expires_in: 1.week) { compute }
    end

    # The axis threshold of the editor's overlay (app/frontend/relief/overlay.ts).
    def self.axis_threshold_m2(grid)
      area = grid.cols * grid.rows * grid.cell_m**2
      area.fdiv(60).clamp(200, 2000)
    end

    private
      def cache_key
        tests = Digest::SHA1.hexdigest(@map.infiltration_measurements.to_json)[0, 12]
        [ "relief/storm/v1", @terrain.id, @terrain.version, @feature.id, @feature.lock_version, tests ]
      end

      def water = @feature.properties.to_h["water"].presence || MapFeature::StormObservation.water_for(@feature.geometry)

      def compute
        @grid = FlowGrid.new(@terrain, heights: @raw)
        case water
        when "flows" then flows
        when "pools" then pools
        else seeps
        end
      end

      def flows
        points = line_points
        cells = points.filter_map { |lng, lat| @grid.index_at(lng, lat) }.select { |i| @grid.heights[i] }
        raise Error, :outside_relief if cells.size < 2

        on_axes = cells.count { |i| near_axis?(i) }.fdiv(cells.size)
        fall = @grid.heights[cells.first] - @grid.heights[cells.last]
        verdict =
          if fall < -UPHILL_M then "uphill"
          elsif on_axes >= FOLLOWS_SHARE then "follows"
          else "diverges"
          end
        result(verdict:, share_on_axes: on_axes.round(2), fall_m: fall.round(2))
      end

      def pools
        cells = surface_cells
        raise Error, :outside_relief if cells.empty?

        hollow = cells.map { |i| @grid.depression(i) }.max
        slope = cells.filter_map { |i| slope_at(i) }
        slope = slope.empty? ? 0.0 : slope.sum / slope.size
        verdict =
          if hollow >= HOLLOW_M then "hollow"
          elsif slope < FLAT_SLOPE then "flat"
          else "sloped"
          end
        rate, distance = nearby_infiltration
        result(verdict:, slope_pct: (slope * 100).round(1), hollow_m: hollow.round(2),
               infiltration_mm_h: rate, infiltration_distance_m: distance)
      end

      def seeps
        point = @feature.geometry.respond_to?(:x) ? [ @feature.geometry.x, @feature.geometry.y ] : centroid
        i = @grid.index_at(*point)
        raise Error, :outside_relief unless i && @grid.heights[i]

        result(verdict: "seep", drained_m2: (@grid.accumulation[i] * @grid.cell_m**2).round)
      end

      def result(**values)
        Result.new(water:, share_on_axes: nil, fall_m: nil, slope_pct: nil, hollow_m: nil, drained_m2: nil,
                   infiltration_mm_h: nil, infiltration_distance_m: nil, **values)
      end

      # A cell within NEAR_AXIS_M of a cell that drains at least the axis threshold.
      def near_axis?(i)
        @threshold ||= (self.class.axis_threshold_m2(@grid) / @grid.cell_m**2).ceil
        reach = (NEAR_AXIS_M / @grid.cell_m).ceil
        c = i % @grid.cols
        r = i / @grid.cols
        (-reach..reach).any? do |dr|
          (-reach..reach).any? do |dc|
            cc = c + dc
            rr = r + dr
            next false if cc.negative? || rr.negative? || cc >= @grid.cols || rr >= @grid.rows

            @grid.accumulation[rr * @grid.cols + cc] >= @threshold
          end
        end
      end

      # The line's vertices every half cell, in drawing order.
      def line_points
        coordinates = @feature.geometry.points.map { |pt| [ pt.x, pt.y ] }
        step = @grid.cell_m / 2
        coordinates.each_cons(2).flat_map do |a, b|
          length = distance_m(a, b)
          n = [ (length / step).ceil, 1 ].max
          (0...n).map { |k| [ a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n ] }
        end + [ coordinates.last ]
      end

      def distance_m(a, b)
        Math.hypot((b[0] - a[0]) * 111_320 * Math.cos(a[1] * Math::PI / 180), (b[1] - a[1]) * 110_540)
      end

      # Cells under the surface; the cell under its centre when it is smaller than a cell.
      def surface_cells
        inside = Mask.for_geometry(@feature.geometry, @grid.extent).each_byte.with_index.filter_map { |byte, i| i if byte == 1 && @grid.heights[i] }
        return inside unless inside.empty?

        i = @grid.index_at(*centroid)
        i && @grid.heights[i] ? [ i ] : []
      end

      def centroid
        point = @feature.geometry.centroid
        [ point.x, point.y ]
      end

      # Steepest slope to a neighbour, as a fraction.
      def slope_at(i)
        h = @grid.heights[i]
        c = i % @grid.cols
        r = i / @grid.cols
        FlowGrid::NEIGHBOURS.filter_map do |dc, dr, distance|
          cc = c + dc
          rr = r + dr
          next if cc.negative? || rr.negative? || cc >= @grid.cols || rr >= @grid.rows

          other = @grid.heights[rr * @grid.cols + cc]
          other && (h - other).abs / (distance * @grid.cell_m)
        end.max
      end

      # The rate of the nearest infiltration test within NEARBY_TEST_M, with its distance.
      def nearby_infiltration
        ids = @map.infiltration_measurements.map { |r| r[:id] }
        return nil if ids.empty?

        nearest = @map.features.active.where(id: ids)
          .select(MapFeature.sanitize_sql_array([ "map_features.*, ST_Distance(map_features.geometry::geography, (SELECT geometry FROM map_features WHERE id = ?)::geography) AS distance_m", @feature.id ]))
          .order("distance_m").first
        nearest && nearest.distance_m <= NEARBY_TEST_M ? [ nearest.infiltration_rate_mm_h, nearest.distance_m.round ] : nil
      end
  end
end
