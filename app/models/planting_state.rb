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
      alerts: PlantingAlerts.new(quantities).as_json,
      growth: growth_json
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

    # Adult size and years to maturity of each species/cultivar on the map,
    # keyed "speciesId:varietyId": the editor's time strip grows the crowns
    # from them (map/time, with the 3D view's curve).
    # An AI's draft plants count too: the strip shows them in the future.
    def growth_json
      drafts = map.features.where(kind: PlantableFeature::PLANT, status: "draft").map { |f| [ f.plant_species_id, f.plant_variety_id ] }
      keys = quantities.by_key.keys | quantities.palette.map(&:key) | drafts
      others = PlantSpecies.where(id: keys.map(&:first) - quantities.species_index.keys).index_by(&:id)
      varieties = PlantVariety.where(id: keys.filter_map(&:last) - quantities.variety_index.keys).index_by(&:id)
      keys.filter_map do |species_id, variety_id|
        species = quantities.species_index[species_id] || others[species_id]
        next unless species
        variety = variety_id && (quantities.variety_index[variety_id] || varieties[variety_id])
        [ "#{species_id}:#{variety_id}", PlantGrowth.inputs(strata: quantities.strata_for([ species_id, variety_id ]) || species.default_strata, species:, variety:) ]
      end.to_h
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
