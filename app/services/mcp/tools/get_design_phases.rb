module Mcp
  module Tools
    # « Phases du projet »: the design phases the designer put away
    # (« Esquisse », « Avant-projet »…), each a frozen copy of the project
    # as it stood, and the phase in progress. With phase_id, the elements of
    # that phase and how the map of today differs from it, so the AI can
    # tell what the design gained or dropped from one phase to the next.
    class GetDesignPhases < Base
      LIMIT = 500

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          phase_id: { type: "integer", minimum: 1, description: :phase_id },
          include_geometry: { type: "boolean", default: false, description: :include_geometry }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, phase_id: nil, include_geometry: false)
        map = find_map!(map_id)
        data = {
          current: map.current_design_phase_name,
          phases: map.phases.listed.includes(:created_by).map(&:as_json),
          editor_url: "#{map_url(map)}?panel=design-phases"
        }
        return data unless phase_id

        phase = map.phases.find_by(id: phase_id) or raise ToolError, t("errors.design_phase_not_found", id: phase_id)
        # The networks stay out of a phase read by an AI, as everywhere in the MCP.
        kept = phase.snapshot.reject { |f| f.dig("properties", "layer") == "networks" }
        compare = phase.compare(map.features.active.in_design.where.not(layer: MapPhase::SKIPPED_LAYERS + %w[networks]))
        compare[:removed] &= kept.map { _1["id"] }
        compare[:changed] &= kept.map { _1["id"] }
        data.merge(
          phase: phase.as_json.except(:snapshot).merge(
            features: kept.first(LIMIT).map { |f| element(f, include_geometry) },
            truncated: kept.size > LIMIT || nil
          ).compact,
          compare:
        )
      end

      private
        def element(feature, geometry)
          props = feature["properties"] || {}
          {
            id: feature["id"], layer: props["layer"], kind: props["kind"], name: props["name"].presence,
            planned: props["planned"], planted_on: props["planted_on"], species_id: props["species_id"], tags: props["tags"].presence,
            geometry: geometry ? feature["geometry"] : nil
          }.compact
        end

        def summarize_result(data) = { phases: data[:phases].size, features: data.dig(:phase, :features)&.size }.compact
    end
  end
end
