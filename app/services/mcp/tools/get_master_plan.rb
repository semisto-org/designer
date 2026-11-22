module Mcp
  module Tools
    # « Plan directeur »: the design numbered theme by theme as the printed
    # master plan shows it (MasterPlan), with the mission, the phase in
    # progress and the palette counted by species, and the link that opens
    # the PDF export in the editor.
    class GetMasterPlan < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          variant_id: { type: "integer", minimum: 1, description: :variant_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, variant_id: nil)
        map = find_map!(map_id)
        variant = variant_id && map.variants.find_by(id: variant_id)
        raise ToolError, t("errors.variant_not_found", id: variant_id) if variant_id && !variant

        MasterPlan.new(map, team: editor?, variant:).as_json.merge(export_url: "#{map_url(map)}?export=master_plan")
      end

      private
        def summarize_result(data) = { elements: data[:themes].sum { _1[:items].size } }
    end
  end
end
