module Relief
  # Everything the editor's "Eau et relief" panel shows, in one JSON: can
  # the relief be imported here, its state and key numbers, the water
  # settings (with the region's defaults) and the roofs' rainwater.
  class Overview
    def initialize(map)
      @map = map
      @provider = Providers::Elevation.for(map.region)
    end

    def as_json(*)
      settings = @map.effective_water_settings
      defaults = @map.hydrology_defaults
      {
        available: @provider.present?,
        providerLabel: @provider&.label,
        hasBoundary: @map.boundary.present?,
        grid: grid_preview,
        terrain: @map.terrain&.as_summary,
        settings: settings.slice(*HasTerrain::WATER_KEYS).transform_keys { |k| k.camelize(:lower) },
        defaults: defaults.slice(*HasTerrain::WATER_KEYS).transform_keys { |k| k.camelize(:lower) },
        soils: defaults["soils"].to_h.keys,
        rainwater: Rainwater.new(@map, settings:).call
      }
    end

    private
      # The grid an import would produce, or why it would be refused.
      def grid_preview
        return nil unless @provider && @map.boundary

        extent = GridPolicy.extent_for(@map.bbox, margin_m: @map.region.setting(:relief, :margin_m) || GridPolicy::DEFAULT_MARGIN_M)
        { cellSizeM: extent.cell_size_m, cols: extent.cols, rows: extent.rows,
          areaKm2: (extent.width_m * extent.height_m / 1_000_000.0).round(2), marginM: extent.margin_m }
      rescue GridPolicy::TooLarge => e
        { error: e.message }
      end
  end
end
