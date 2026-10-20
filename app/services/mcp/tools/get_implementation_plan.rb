module Mcp
  module Tools
    # The implementation plan of a map (« Mise en œuvre »): its phases in
    # order, what each one builds and plants (grouped by kind or species,
    # with the elements' ids), the workload and cost against the time and
    # budget of the project sheet, the guide's advice, what is in no phase
    # yet, and the phases an AI proposed that wait for a human.
    class GetImplementationPlan < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        plan = Implementation::Plan.new(map, networks: editor?).as_json
        {
          url: "#{map_url(map)}/implementation",
          phases: plan[:phases].map { phase_json(_1) },
          proposed_phases: plan[:drafts].map { phase_json(_1) },
          not_in_a_phase: plan[:unassigned][:groups].map { group_json(_1) },
          drawn_as_existing_ids: plan[:drawnAsExisting],
          project_sheet: plan[:sheet].transform_keys(&:underscore),
          totals: { hours: plan[:totals][:hours], cost_cents: plan[:totals][:costCents], done: plan[:totals][:done], count: plan[:totals][:count] },
          advice: plan[:advice].map { advice_json(_1) },
          note: t("notes.implementation")
        }
      end

      private
        def phase_json(phase)
          {
            id: phase[:id], name: phase[:name], starts_on: phase[:startsOn], ends_on: phase[:endsOn], notes: phase[:notes],
            rationale: phase[:rationale], hours: phase[:hours][:total], hours_estimated: phase[:hours][:estimated],
            hours_available: phase.dig(:available, :hours), cost_cents: phase[:costCents],
            done: phase[:done], count: phase[:count], groups: phase[:groups].map { group_json(_1) },
            advice: phase[:advice]&.map { advice_json(_1) }
          }.compact
        end

        def group_json(group)
          {
            kind: group[:kind], layer: group[:layer], name: group[:label] || I18n.t("editor.kinds.#{group[:kind]}", default: group[:kind]),
            count: group[:count], done: group[:done], quantity: group[:quantity], per: group[:per], hours: group[:hours],
            machine: group[:machine], season: group[:season], feature_ids: group[:featureIds]
          }
        end

        def advice_json(advice) = advice.transform_keys { _1.to_s.underscore }

        def summarize_result(data) = { phases: data[:phases].size, proposed: data[:proposed_phases].size }
    end
  end
end
