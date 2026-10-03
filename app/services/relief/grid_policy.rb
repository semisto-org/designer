module Relief
  # Chooses the grid of a map's relief: 1 m cells while the terrain and its
  # margin stay around one square kilometre, coarser above, and a refusal
  # (in French, for the user) beyond what a browser can simulate.
  #
  # The cell budget is what the 3D page can mesh and analyse in a browser
  # (drainage, sun, rain) and what the elevation provider can deliver in a
  # reasonable time: 1.8 M cells ≈ 1 km² plus a 150 m margin at 1 m, ~90
  # identify requests per dataset on the SPW.
  class GridPolicy
    CELL_SIZES = [ 1.0, 2.0, 5.0 ].freeze
    MAX_CELLS = 1_800_000
    DEFAULT_MARGIN_M = 150.0

    class TooLarge < StandardError
      attr_reader :area_km2, :max_km2

      def initialize(area_km2, max_km2)
        @area_km2 = area_km2
        @max_km2 = max_km2
        super(I18n.t("relief.errors.too_large", area: format_km2(area_km2), max: format_km2(max_km2)))
      end

      private
        def format_km2(value) = ActiveSupport::NumberHelper.number_to_rounded(value, precision: 1, delimiter: " ", separator: ",")
    end

    def self.extent_for(bbox, margin_m: DEFAULT_MARGIN_M, max_cells: MAX_CELLS)
      new(margin_m:, max_cells:).extent_for(bbox)
    end

    def initialize(margin_m: DEFAULT_MARGIN_M, max_cells: MAX_CELLS)
      @margin_m = margin_m.to_f
      @max_cells = max_cells
    end

    def extent_for(bbox)
      CELL_SIZES.each do |size|
        extent = Extent.around(bbox, cell_size_m: size, margin_m: @margin_m)
        return extent if extent.cells <= @max_cells
      end
      coarsest = Extent.around(bbox, cell_size_m: CELL_SIZES.last, margin_m: @margin_m)
      area_km2 = coarsest.width_m * coarsest.height_m / 1_000_000.0
      max_km2 = @max_cells * CELL_SIZES.last**2 / 1_000_000.0
      raise TooLarge.new(area_km2, max_km2)
    end
  end
end
