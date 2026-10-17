module Mcp
  # Bridge to the plant catalogue: the same search as /plants and the same
  # values as the species sheet, each with its per-field provenance.
  module PlantCatalog
    # `user`: the species proposed but not yet reviewed are only theirs.
    # `site` (PlantFit::Site): each result also says how it fits that map.
    def self.search(query, limit:, user: nil, site: nil)
      species = PlantSpecies.matching(query).where(id: PlantSpecies.visible_to(user).select(:id))
                            .includes(:common_names, *(site ? [ :field_sources ] : [])).limit(limit)
      species.map do |s|
        next s.summary_json unless site
        s.summary_json.merge(fit: site.fit(s).as_json, excludedBy: site.excluded_by(s))
      end
    end

    def self.find(id, user: nil)
      PlantSpecies.visible_to(user).includes(:common_names, :field_sources, varieties: :field_sources).find_by(id:)&.sheet_json
    end
  end
end
