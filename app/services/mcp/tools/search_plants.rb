module Mcp
  module Tools
    class SearchPlants < Base
      arguments(
        properties: {
          query: { type: "string", minLength: 2, maxLength: 100, description: :query },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: :limit }
        },
        required: %w[query]
      )
      hints

      def perform(query:, limit: 20)
        raise ToolError, t("errors.plants_unavailable") unless PlantCatalog.available?
        { query:, results: PlantCatalog.search(query.strip, limit:) }
      rescue PlantCatalog::Unavailable
        raise ToolError, t("errors.plants_unavailable")
      end

      private
        def summarize_result(data) = { results: data[:results].size }
    end
  end
end
