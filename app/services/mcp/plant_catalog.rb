module Mcp
  # Bridge to the plant catalogue: the same search as /plants and the same
  # values as the species sheet, each with its per-field provenance.
  module PlantCatalog
    # `user`: the species proposed but not yet reviewed are only theirs.
    def self.search(query, limit:, user: nil)
      PlantSpecies.matching(query).where(id: PlantSpecies.visible_to(user).select(:id))
                  .includes(:common_names).limit(limit).map(&:summary_json)
    end

    def self.find(id, user: nil)
      PlantSpecies.visible_to(user).includes(:common_names, :field_sources, varieties: :field_sources).find_by(id:)&.sheet_json
    end
  end
end
