module Relief
  # The keypoints of a terrain (P.A. Yeomans, « Water for every farm », 1954):
  # on the floor of a valley, the point where its steep upper part gives way
  # to its gentler lower part. The contour through it, the keyline, is where
  # a swale or a line of trees gathers the water of the valley and spreads it
  # onto the ridges on either side, instead of letting it run down the
  # valley floor.
  #
  # Valley floors are the cells that drain at least MIN_CATCHMENT_M2
  # (Relief::FlowGrid). Each floor, from its head down its main stem to the
  # valley it joins or the edge of the relief, is read as a long profile: at each cell, the mean slope over WINDOW_M above it and below
  # it. The keypoint is where the slope above exceeds the slope below the
  # most, as long as the slope above is a real slope (MIN_SLOPE_ABOVE) and
  # clearly steeper than below (MIN_BREAK).
  class Keypoints
    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("relief.keypoints.errors.#{key}"))
      end
    end

    MIN_CATCHMENT_M2 = 1000
    WINDOW_M = 10.0
    MIN_SLOPE_ABOVE = 0.03
    MIN_BREAK = 1.5
    # Two keypoints closer than this are one.
    MIN_SPACING_M = 15.0
    LIMIT = 8

    Keypoint = Data.define(:lng, :lat, :elevation_m, :slope_above_pct, :slope_below_pct, :catchment_m2, :valley, :keyline) do
      def as_json(*)
        {
          lng:, lat:, elevationM: elevation_m, slopeAbovePct: slope_above_pct, slopeBelowPct: slope_below_pct,
          catchmentM2: catchment_m2, valley:, keyline: keyline&.as_json
        }
      end
    end

    Result = Data.define(:keypoints, :cell_size_m, :min_catchment_m2) do
      def as_json(*) = { keypoints: keypoints.map(&:as_json), cellSizeM: cell_size_m, minCatchmentM2: min_catchment_m2 }
    end

    def initialize(map, heights: nil)
      @map = map
      @terrain = map.terrain
      @raw = heights
    end

    def call
      raise Error, :no_relief unless @terrain&.ready? && @terrain.grid.attached?

      Rails.cache.fetch(cache_key, expires_in: 1.week) { compute }
    end

    private
      def cache_key
        [ "relief/keypoints/v1", @terrain.id, @terrain.version, @map.boundary && Digest::SHA1.hexdigest(@map.boundary.as_text)[0, 12] ]
      end

      def compute
        @raw ||= @terrain.grid.download.unpack("v*")
        @grid = FlowGrid.new(@terrain, heights: @raw)
        @inside = @map.boundary ? Mask.for_geometry(@map.boundary, @grid.extent) : nil
        cell_area = @grid.cell_m**2
        @threshold = [ (MIN_CATCHMENT_M2 / cell_area).ceil, 2 ].max

        candidates = stretches.filter_map { |path| best_on(path) }
        chosen = []
        candidates.sort_by { |c| -c[:score] }.each do |candidate|
          next if chosen.any? { |other| distance_m(other[:cell], candidate[:cell]) < MIN_SPACING_M }

          chosen << candidate
          break if chosen.size == LIMIT
        end

        Result.new(
          keypoints: chosen.map { |c| keypoint(c, cell_area) },
          cell_size_m: @grid.cell_m.round(2),
          min_catchment_m2: MIN_CATCHMENT_M2
        )
      end

      def channel?(i) = i >= 0 && @grid.accumulation[i] >= @threshold

      # Valley floors (cell paths, upstream first): from each head down its
      # main stem, until it joins a larger valley as a side branch or leaves
      # the relief.
      def stretches
        receivers = @grid.receivers
        acc = @grid.accumulation
        main_donor = Array.new(@grid.n)
        has_donor = Array.new(@grid.n, false)
        @grid.n.times do |i|
          to = receivers[i]
          next unless channel?(i) && channel?(to)

          has_donor[to] = true
          main_donor[to] = i if main_donor[to].nil? || acc[i] > acc[main_donor[to]]
        end
        (0...@grid.n).select { |i| channel?(i) && !has_donor[i] }.map do |head|
          path = [ head ]
          i = receivers[head]
          while channel?(i)
            path << i
            break unless main_donor[i] == path[-2]

            i = receivers[i]
          end
          path
        end
      end

      # The point of a stretch where its slope breaks the most, or nil.
      def best_on(path)
        return nil if path.size < 3

        heights = path.map { |i| @grid.heights[i] }
        along = [ 0.0 ]
        path.each_cons(2) { |a, b| along << along.last + distance_m(a, b) }
        window = [ WINDOW_M, @grid.cell_m * 3 ].max
        best = nil
        path.each_with_index do |cell, k|
          next if along[k] < window || along.last - along[k] < window
          next if @inside && @inside.getbyte(cell) != 1

          above = (height_at(along, heights, along[k] - window) - heights[k]) / window
          below = (heights[k] - height_at(along, heights, along[k] + window)) / window
          next if above < MIN_SLOPE_ABOVE || above < MIN_BREAK * [ below, 0 ].max

          score = above - below
          best = { cell:, score:, above:, below:, path: } if best.nil? || score > best[:score]
        end
        best
      end

      # Height of the profile at a distance along it.
      def height_at(along, heights, s)
        k = along.bsearch_index { |d| d >= s } || along.size - 1
        return heights[k] if k.zero? || along[k] == s

        t = (s - along[k - 1]) / (along[k] - along[k - 1])
        heights[k - 1] + (heights[k] - heights[k - 1]) * t
      end

      def keypoint(candidate, cell_area)
        lng, lat = @grid.lng_lat(candidate[:cell])
        keyline =
          begin
            Contour.new(@map, lng:, lat:, heights: @raw).call
          rescue Contour::Error
            nil
          end
        Keypoint.new(
          lng: lng.round(7), lat: lat.round(7),
          elevation_m: keyline&.elevation_m || @grid.heights[candidate[:cell]].round(2),
          slope_above_pct: (candidate[:above] * 100).round(1),
          slope_below_pct: (candidate[:below] * 100).round(1),
          catchment_m2: (@grid.accumulation[candidate[:cell]] * cell_area).round,
          valley: valley_line(candidate[:path]),
          keyline:
        )
      end

      def valley_line(path)
        { "type" => "LineString", "coordinates" => path.map { |i| @grid.lng_lat(i).map { |v| v.round(7) } } }
      end

      def distance_m(a, b)
        cols = @grid.cols
        Math.hypot(a % cols - b % cols, a / cols - b / cols) * @grid.cell_m
      end
  end
end
