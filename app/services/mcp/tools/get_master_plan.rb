module Mcp
  module Tools
    # « Plan directeur »: the design numbered theme by theme as the printed
    # master plan shows it (MasterPlan), with the mission, the phase in
    # progress and the palette counted by species, and the link that opens
    # the PDF export in the editor.
    class GetMasterPlan < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        MasterPlan.new(map, team: editor?).as_json.merge(export_url: "#{map_url(map)}?export=master_plan")
      end

      private
        def summarize_result(data) = { elements: data[:themes].sum { _1[:items].size } }
    end
  end
end
