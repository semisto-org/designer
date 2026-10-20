module Mcp
  module Tools
    # Proposes phases for the implementation plan (« Mise en œuvre »), as
    # drafts a human accepts or refuses on the plan's page: each with its
    # season (dates), notes, rationale and the elements it would build or
    # plant. Accepting a phase gives it those elements. To move elements
    # into an existing phase, propose_feature_updates with `phase_id`.
    class ProposePhases < Base
      MAX_PHASES = 10

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          phases: {
            type: "array", minItems: 1, maxItems: MAX_PHASES, description: :phases,
            items: {
              type: "object", additionalProperties: false, required: %w[name starts_on ends_on rationale],
              properties: {
                name: { type: "string", minLength: 1, maxLength: 120, description: :phase_name },
                starts_on: { type: "string", format: "date", description: :starts_on },
                ends_on: { type: "string", format: "date", description: :ends_on },
                notes: { type: "string", maxLength: 4000, description: :phase_notes },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :phase_rationale },
                feature_ids: { type: "array", maxItems: 2000, items: { type: "integer" }, description: :phase_feature_ids }
              }
            }
          }
        },
        required: %w[map_id phases]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, phases:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        on_map = map.features.where(status: "active").pluck(:id).to_set
        created = []
        rejected = []
        ImplementationPhase.transaction do
          phases.each_with_index do |raw, index|
            raw = raw.to_h.stringify_keys
            ids = Array(raw["feature_ids"]).map(&:to_i).uniq
            phase = map.implementation_phases.new(
              status: "draft", source: "ai", name: raw["name"], notes: raw["notes"], rationale: raw["rationale"],
              starts_on: parse_date(raw["starts_on"]), ends_on: parse_date(raw["ends_on"]), proposed_feature_ids: ids & on_map.to_a
            )
            if phase.save
              created << { index:, id: phase.id, name: phase.name, elements: phase.proposed_feature_ids.size, unknown_ids: (ids - on_map.to_a).first(20) }
            else
              rejected << { index:, error: phase.errors.full_messages.to_sentence }
            end
          end
        end
        raise ToolError, t("errors.nothing_created", details: rejected.first(10).map { "##{_1[:index]} : #{_1[:error]}" }.join(" ; ")) if created.empty?
        { created:, rejected:, review_url: "#{map_url(map)}/implementation", next_step: t("notes.review_phases") }
      end

      private
        def parse_date(value) = (Date.iso8601(value.to_s) rescue nil)

        def summarize_arguments(arguments) = { map_id: arguments[:map_id], summary: arguments[:summary]&.first(200), phases: Array(arguments[:phases]).size }.compact

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
