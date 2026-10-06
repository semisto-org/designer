module Mcp
  module Tools
    # Proposes answers for the project sheet, as drafts a human accepts or
    # refuses on the sheet: what the person said in the conversation, or
    # what an interview transcript tells. A field already answered is only
    # replaced once the human accepts, and the result says so.
    class ProposeProjectSheet < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          answers: {
            type: "array", minItems: 1, maxItems: ProjectSheetProposal::MAX_ANSWERS, description: :answers,
            items: {
              type: "object", additionalProperties: false, required: %w[section field value rationale],
              properties: {
                section: { type: "string", enum: ProjectSheet::SECTIONS.keys, description: :section },
                field: { type: "string", maxLength: 40, description: :field },
                value: { description: :value },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :answer_rationale }
              }
            }
          }
        },
        required: %w[map_id answers]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, answers:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        outcome = ProjectSheetProposal.new(map:, user:, client_name: principal.client_name).call(answers)
        if outcome.created.empty? && outcome.unchanged.empty?
          details = outcome.rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_created", details:)
        end
        replacing = outcome.created.select { |c| c[:replaces] }
        {
          created: outcome.created.map do |c|
            { index: c[:index], section: c[:draft].section, field: c[:draft].field, value: c[:draft].value, replaces: c[:replaces] }.compact
          end,
          unchanged: outcome.unchanged,
          rejected: outcome.rejected,
          pending_project_drafts: map.project_sheet_drafts.count,
          review_url: "#{map_url(map)}/project",
          next_step: t(replacing.any? ? "notes.review_project_replacing" : "notes.review_project", count: replacing.size)
        }
      end

      private
        def summarize_arguments(arguments)
          {
            map_id: arguments[:map_id], summary: arguments[:summary]&.first(200),
            answers: Array(arguments[:answers]).size
          }.compact
        end

        def summarize_result(data) = { created: data[:created].size, unchanged: data[:unchanged].size, rejected: data[:rejected].size }
    end
  end
end
