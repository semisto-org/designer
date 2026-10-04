module Mcp
  # Bridge to the plant catalogue: the same search as /plants and the same
  # values as the species sheet, each with its per-field provenance.
  module PlantCatalog
    def self.search(query, limit:)
      PlantSpecies.matching(query).includes(:common_names).limit(limit).map(&:summary_json)
    end

    def self.find(id)
      PlantSpecies.includes(:common_names, :field_sources, varieties: :field_sources).find_by(id:)&.sheet_json
    end
  end
end
