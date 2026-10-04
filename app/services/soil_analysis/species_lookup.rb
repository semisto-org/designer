module SoilAnalysis
  # Looks species up in the plant catalogue, to link an observed
  # bio-indicator plant to its species sheet.
  module SpeciesLookup
    module_function

    def available? = true

    # [{ id:, name:, latin: }]
    def search(query, limit: 8)
      query = query.to_s.strip
      return [] if query.length < 2

      PlantSpecies.matching(query).includes(:common_names).limit(limit).map do |species|
        { id: species.id, name: species.common_name || species.latin_name, latin: species.latin_name }
      end
    end
  end
end
