# Everything the map editor needs to show a map's planting, in one read:
# the palette with its counters, the species and cultivars in use (for
# crowns and labels), each patch's composition and quantities, the plant
# list and the coherence alerts. Recomputed after every planting change.
class PlantingState
  attr_reader :map, :quantities

  def initialize(map)
    @map = map
    @quantities = map.planted_quantities
  end

  def as_json(*)
    {
      zone: map.hardiness_zone, minTemperatureC: map.min_temperature_c, country: map.country_code,
      palette: palette_json,
      # An AI's proposals for the palette, waiting for a human (« Palette » panel).
      paletteDrafts: map.palette_drafts.includes(species: :common_names, variety: %i[common_names species]).map(&:as_json),
      species: quantities.species_index.transform_keys(&:to_s).transform_values(&:summary_json),
      varieties: quantities.variety_index.transform_keys(&:to_s).transform_values(&:summary_json),
      patches: patches_json,
      strata: strata_json,
      list: PlantList.new(quantities).as_json,
      alerts: PlantingAlerts.new(quantities).as_json
    }
  end

  private
    def palette_json
      quantities.palette.map do |item|
        slot = quantities.slot_for(item.key)
        item.as_json.merge(planned: slot.planned, placed: slot.placed, planted: slot.planted)
      end
    end

    def patches_json
      quantities.patches.to_h do |patch|
        lines = patch.lines.map do |line|
          line.item.as_json.merge(
            effectiveStrata: line.strata, effectiveDensity: line.density, quantity: line.quantity,
            defaultDensity: StrataDensity.default_for(line.strata),
            densityRange: StrataDensity.range_for(line.strata)&.then { |r| [ r.min, r.max ] }
          )
        end
        [ patch.feature.id.to_s, { areaM2: patch.area_m2, total: patch.lines.sum(&:quantity), items: lines } ]
      end
    end

    # Plants planned per strata, every strata listed (the palette balance).
    def strata_json
      totals = PlantVocabulary::STRATA.index_with { 0 }
      quantities.by_key.each do |key, slot|
        strata = quantities.strata_for(key)
        totals[strata] += slot.planned if totals.key?(strata)
      end
      totals
    end
end
