module Mcp
  module Tools
    # Catalogue search. With a map, each species also says how it fits that
    # map (PlantFit: one verdict per criterion the site can judge, never a
    # score) and whether a known fact rules it out; without a query, the map's
    # palette suggestions come back instead.
    class SearchPlants < Base
      arguments(
        properties: {
          query: { type: "string", minLength: 2, maxLength: 100, description: :query },
          map_id: { type: "integer", minimum: 1, description: :map_id },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: :limit }
        }
      )
      hints

      def perform(query: nil, map_id: nil, limit: 20)
        raise ToolError, t("errors.search_plants_needs_query") if query.blank? && map_id.nil?
        return { query:, results: PlantCatalog.search(query.strip, limit:, user:) } unless map_id

        map = find_map!(map_id)
        if query.blank?
          suggestions = PaletteSuggestions.new(map)
          return suggestions.as_json.merge(map_id:)
        end
        site = PlantFit::Site.new(map)
        { query:, map_id:, site: site.as_json, results: PlantCatalog.search(query.strip, limit:, user:, site:) }
      end

      private
        def summarize_result(data) = { results: (data[:results] || data[:suggestions]).size }
    end
  end
end
