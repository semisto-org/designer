module Relief
  # The map's relief as water sees it: heights averaged by blocks down to a
  # budget of cells, where each cell drains, and how much ground drains
  # through it. Shared by the catchment of an element (Relief::Catchment)
  # and the search for keypoints (Relief::Keypoints).
  #
  # Each cell drains to its steepest lower neighbour (D8). A cell with no
  # lower neighbour (a pit, a flat) drains where a priority-flood (Barnes,
  # Lehman & Mulla 2014, as the « Écoulement » layer of the editor,
  # app/frontend/relief/hydro.ts) says its water spills. Borders and cells
  # next to missing data are outlets (-1): water leaves the known relief there.
  class FlowGrid
    # Cells the flood works on: a 1 m grid of a large map is averaged by
    # blocks down to this budget (a catchment at 2 m is still precise).
    MAX_CELLS = 300_000
    EPSILON = 1e-5
    NEIGHBOURS = [ -1, 0, 1 ].product([ -1, 0, 1 ]).reject { |d| d == [ 0, 0 ] }.map { |dc, dr| [ dc, dr, Math.hypot(dc, dr) ] }.freeze

    attr_reader :heights, :cols, :rows, :n, :cell_m, :extent

    def initialize(terrain, heights: nil, max_cells: MAX_CELLS)
      @terrain = terrain
      @raw = heights
      @max_cells = max_cells
      load_grid
    end

    def edge?(i)
      c = i % @cols
      r = i / @cols
      return true if c.zero? || r.zero? || c == @cols - 1 || r == @rows - 1

      [ i - 1, i + 1, i - @cols, i + @cols ].any? { |j| @heights[j].nil? }
    end

    # The downstream cell of each cell (-1 where water leaves the relief).
    def receivers
      @receivers ||= drainage
    end

    # Number of cells whose water passes through each cell, itself included.
    def accumulation
      @accumulation ||= begin
        receiver = receivers
        acc = Array.new(@n) { |i| @heights[i] ? 1 : 0 }
        pending = Array.new(@n, 0)
        receiver.each { |to| pending[to] += 1 unless to.negative? }
        queue = (0...@n).select { |i| @heights[i] && pending[i].zero? }
        until queue.empty?
          i = queue.pop
          to = receiver[i]
          next if to.negative?

          acc[to] += acc[i]
          pending[to] -= 1
          queue << to if pending[to].zero?
        end
        acc
      end
    end

    # How deep water stands in a cell once the depressions are filled
    # (metres, 0 where it drains away).
    def depression(i)
      receivers
      h = @heights[i]
      h && @filled[i] ? [ @filled[i] - h, 0.0 ].max : 0.0
    end

    # The cell under a WGS84 position, or nil outside the grid.
    def index_at(lng, lat)
      c, r = @extent.to_grid(lng, lat).map(&:round)
      return nil if c.negative? || r.negative? || c >= @cols || r >= @rows

      r * @cols + c
    end

    # [lng, lat] of a cell's centre.
    def lng_lat(i) = Mercator.inverse(*@extent.point(i))

    private
      # Heights averaged by blocks of `@factor` × `@factor` (nil = no data),
      # on an extent whose cells are the blocks.
      def load_grid
        cols = @terrain.cols
        rows = @terrain.rows
        raw = @raw || @terrain.grid.download.unpack("v*")
        nodata = @terrain.nodata || Raster::NODATA
        z_min = @terrain.z_min.to_f
        z_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        @factor = Math.sqrt(cols * rows / @max_cells.to_f).ceil.clamp(1, 100)
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
        @filled = filled
        receiver
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
