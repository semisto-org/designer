# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources) — slope by
# Horn's method, as in map_relief_station.js.
module Relief
  # Key numbers of the terrain inside the map's boundary: lowest and highest
  # point, drop, mean and steep (90th percentile) slope. Computed once by the
  # import job and stored with the terrain, so the editor panel can show them
  # without loading the grid.
  class Stats
    def initialize(heights, extent, mask)
      @heights = heights
      @extent = extent
      @mask = mask
    end

    def call
      cols = @extent.cols
      rows = @extent.rows
      cell = @extent.cell_size_m
      z_min = Float::INFINITY
      z_max = -Float::INFINITY
      slopes = []
      inside = 0
      rows.times do |r|
        offset = r * cols
        cols.times do |c|
          i = offset + c
          next unless @mask.getbyte(i) == 1

          z = @heights[i]
          next if z.nil?

          inside += 1
          z_min = z if z < z_min
          z_max = z if z > z_max
          slope = slope_at(c, r, cols, rows, cell)
          slopes << slope if slope
        end
      end
      return {} if inside.zero?

      slopes.sort!
      {
        "z_min" => z_min.round(2),
        "z_max" => z_max.round(2),
        "drop" => (z_max - z_min).round(2),
        "slope_mean_pct" => slopes.empty? ? nil : (slopes.sum / slopes.size * 100).round(1),
        "slope_p90_pct" => slopes.empty? ? nil : (slopes[(slopes.size * 0.9).floor.clamp(0, slopes.size - 1)] * 100).round(1),
        "cells" => inside
      }
    end

    private
      # Gradient magnitude (rise over run) with Horn's 3×3 weights; nil when a
      # neighbour has no data. Edges clamp to the nearest cell.
      def slope_at(c, r, cols, rows, cell)
        at = ->(cc, rr) { @heights[rr.clamp(0, rows - 1) * cols + cc.clamp(0, cols - 1)] }
        a = at.(c - 1, r - 1); b = at.(c, r - 1); d = at.(c + 1, r - 1)
        e = at.(c - 1, r); f = at.(c + 1, r)
        g = at.(c - 1, r + 1); h = at.(c, r + 1); k = at.(c + 1, r + 1)
        return nil if [ a, b, d, e, f, g, h, k ].any?(&:nil?)

        dzdx = ((d + 2 * f + k) - (a + 2 * e + g)) / (8 * cell)
        dzdy = ((a + 2 * b + d) - (g + 2 * h + k)) / (8 * cell)
        Math.hypot(dzdx, dzdy)
      end
  end
end
