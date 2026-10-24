module Mcp
  module Tools
    # A species sheet, and where it is in the ground on other gardeners'
    # places that chose to show it (SharedPlantings: region and rounded
    # distance only, never the map, its address or its people).
    class GetPlant < Base
      arguments(
        properties: { plant_id: { type: "integer", minimum: 1, description: :plant_id } },
        required: %w[plant_id]
      )
      hints

      def perform(plant_id:)
        sheet = PlantCatalog.find(plant_id, user:) || raise(ToolError, t("errors.plant_not_found", id: plant_id))
        sheet.merge(sharedGardens: SharedPlantings.new(PlantSpecies.find(plant_id), user).as_json)
      end

      private
        def summarize_result(_data) = { found: 1 }
    end
  end
end
