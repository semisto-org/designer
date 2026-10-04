module Mcp
  module Tools
    class GetPlant < Base
      arguments(
        properties: { plant_id: { type: "integer", minimum: 1, description: :plant_id } },
        required: %w[plant_id]
      )
      hints

      def perform(plant_id:)
        PlantCatalog.find(plant_id) || raise(ToolError, t("errors.plant_not_found", id: plant_id))
      end

      private
        def summarize_result(_data) = { found: 1 }
    end
  end
end
