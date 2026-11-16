module Relief
  # The flow axes of a relief: the lines where runoff gathers, from the cells
  # that drain at least `min_drained_m2` (Relief::FlowGrid, D8 with the
  # priority-flood). Each axis runs from a source or a confluence down to the
  # next confluence or to where water leaves the relief, so a branching
  # network reads as one line per stretch, with the ground it drains at its
  # lower end.
  #
  # On a territory's fine window (5 m) these are the axes of a street, a
  # field edge or a dry valley: where a « sol » or « ralentir » lead belongs.
  class FlowAxes
    # Above this many axes, the threshold doubles until they fit (a JSON an
    # AI can read, not a hydrographic survey).
    MAX_AXES = 300

    Axis = Data.define(:coordinates, :drained_m2, :length_m)

    attr_reader :min_drained_m2

    def initialize(grid, min_drained_m2:)
      @grid = grid
      @min_drained_m2 = min_drained_m2.to_f
    end

    def call
      loop do
        axes = trace
        return axes if axes.size <= MAX_AXES

        @min_drained_m2 *= 2
      end
    end

    def as_geojson(axes)
      {
        type: "FeatureCollection",
        features: axes.map do |axis|
          { type: "Feature", geometry: { type: "LineString", coordinates: axis.coordinates },
            properties: { drained_m2: axis.drained_m2.round, length_m: axis.length_m.round } }
        end
      }
    end

    private
      def trace
        cell_area = @grid.cell_m**2
        threshold = [ (@min_drained_m2 / cell_area).ceil, 2 ].max
        acc = @grid.accumulation
        receiver = @grid.receivers
        axis = Array.new(@grid.n) { |i| acc[i] >= threshold }
        upstream = Array.new(@grid.n, 0)
        @grid.n.times { |i| upstream[receiver[i]] += 1 if axis[i] && receiver[i] >= 0 && axis[receiver[i]] }

        starts = (0...@grid.n).select { |i| axis[i] && upstream[i] != 1 }
        starts.filter_map do |start|
          cells = [ start ]
          current = start
          loop do
            following = receiver[current]
            break if following.negative? || !axis[following]

            cells << following
            break if upstream[following] != 1

            current = following
          end
          next if cells.size < 2

          Axis.new(coordinates: simplify(cells), drained_m2: acc[cells.last] * cell_area,
                   length_m: (cells.size - 1) * @grid.cell_m)
        end
      end

      # Cell centres where the D8 direction turns: a straight run of cells is
      # one segment.
      def simplify(cells)
        cols = @grid.cols
        points = [ cells.first ]
        cells.each_cons(3) do |a, b, c|
          points << b if (b - a) != (c - b) || (b % cols - a % cols) != (c % cols - b % cols)
        end
        points << cells.last
        points.map { |i| @grid.lng_lat(i).map { |v| v.round(6) } }
      end
  end
end
