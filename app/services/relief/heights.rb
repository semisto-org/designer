module Relief
  # The ground's height at a WGS84 position, read from a map's terrain grid:
  # the mean of the known nodes within about a metre (a 1 m LiDAR grid has
  # noise; a tank stand or a pipe end sits on a patch of ground, not a node).
  # nil outside the grid or where it has no data.
  class Heights
    RADIUS_M = 1.0

    def initialize(terrain, heights: nil)
      @terrain = terrain
      @raw = heights
    end

    def at(lng, lat)
      load_grid
      x, y = Mercator.forward(lng.to_f, lat.to_f)
      c = ((x - @terrain.west) / @terrain.step).round
      r = ((@terrain.north - y) / @terrain.step).round
      return nil if c.negative? || r.negative? || c >= @cols || r >= @rows

      values = ((r - @radius)..(r + @radius)).flat_map do |rr|
        ((c - @radius)..(c + @radius)).filter_map do |cc|
          next if rr.negative? || cc.negative? || rr >= @rows || cc >= @cols
          v = @raw[rr * @cols + cc]
          v unless v.nil? || v == @nodata
        end
      end
      values.empty? ? nil : @z_min + values.sum.to_f / values.size * @z_unit
    end

    private
      def load_grid
        return if @cols

        @raw ||= @terrain.grid.download.unpack("v*")
        @cols = @terrain.cols
        @rows = @terrain.rows
        @nodata = @terrain.nodata || Raster::NODATA
        @z_min = @terrain.z_min.to_f
        @z_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        @radius = (RADIUS_M / @terrain.cell_size_m.to_f).round.clamp(0, 3)
      end
  end
end
