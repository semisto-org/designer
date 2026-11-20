module Relief
  # How tall the trees already on the land are, read from the map's relief:
  # the surface model (the top of the trees and roofs, from LiDAR in
  # Wallonia) minus the terrain model (the bare ground) under the crown.
  # Only a fine grid says it (at most 2 m a cell): a 30 m surface model
  # blurs a tree into its neighbours. Read in the editor (« Hauteur vue
  # d'en haut ») and served to the MCP with get_feature.
  #
  #   heights = Relief::TreeHeights.new(map)
  #   heights.available?                         # a ready relief with a fine surface model
  #   heights.at(lng, lat, crown_m: 12)          # => 17.5 (m), or nil
  class TreeHeights
    MAX_CELL_M = 2.0
    # Lower than this, the LiDAR sees a bush, a fence or noise.
    MIN_TREE_M = 1.5
    # The top of a crown is near its middle: look within this share of its radius.
    CROWN_SHARE = 0.6
    DEFAULT_CROWN_M = 6.0

    def initialize(map)
      @terrain = map.terrain
    end

    def available?
      return @available if defined?(@available)

      @available = !!(@terrain&.ready? && @terrain.surface.attached? && @terrain.metadata["surface"] &&
                      @terrain.cell_size_m.to_f.positive? && @terrain.cell_size_m.to_f <= MAX_CELL_M)
    end

    # The surface model's name (« SPW, MNS LiDAR 2021-2022 »), or nil.
    def source = @terrain&.metadata&.dig("sources", "surface")

    # The tree's height in metres (to 0.5 m) at a WGS84 point, or nil when
    # the relief cannot say or sees nothing tall there.
    def at(lng, lat, crown_m: nil)
      return nil unless available?
      load_grids
      x, y = Mercator.forward(lng.to_f, lat.to_f)
      c = ((x - @terrain.west) / @terrain.step).round
      r = ((@terrain.north - y) / @terrain.step).round
      return nil if c.negative? || r.negative? || c >= @cols || r >= @rows

      crown = crown_m.to_f.positive? ? crown_m.to_f : DEFAULT_CROWN_M
      radius = ((crown / 2 * CROWN_SHARE).clamp(1.5, 8.0) / @cell).ceil
      tops = []
      ((r - radius)..(r + radius)).each do |rr|
        next if rr.negative? || rr >= @rows
        ((c - radius)..(c + radius)).each do |cc|
          next if cc.negative? || cc >= @cols || (rr - r)**2 + (cc - c)**2 > radius**2
          index = rr * @cols + cc
          ground, top = @ground[index], @top[index]
          next if ground == @nodata || top == Raster::NODATA
          tops << (@top_min + top * @top_unit) - (@ground_min + ground * @ground_unit)
        end
      end
      # The second highest: one stray return (a bird, a wire) does not make a tree.
      best = tops.max(2).last
      return nil unless best && best >= MIN_TREE_M

      (best * 2).round / 2.0
    end

    # { feature id => height } for existing trees, those the relief can say.
    def for_features(features)
      return {} unless available?

      features.each_with_object({}) do |feature, heights|
        point = feature.geometry
        next unless point.respond_to?(:x)
        height = at(point.x, point.y, crown_m: feature.properties["crown_diameter_m"])
        heights[feature.id] = height if height
      end
    end

    private
      def load_grids
        return if @cols

        @cols = @terrain.cols
        @rows = @terrain.rows
        @cell = @terrain.cell_size_m.to_f
        @nodata = @terrain.nodata || Raster::NODATA
        @ground = @terrain.grid.download.unpack("v*")
        @ground_min = @terrain.z_min.to_f
        @ground_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        surface = @terrain.metadata["surface"]
        @top = @terrain.surface.download.unpack("v*")
        @top_min = surface["z_min"].to_f
        @top_unit = (surface["z_unit"] || Raster::Z_UNIT).to_f
      end
  end
end
