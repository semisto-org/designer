module Mcp
  module Tools
    # Brings a list of plants into a map's palette, as drafts a human
    # accepts or refuses in the Palette panel: the person's own list (a
    # spreadsheet, a PDF, an export of another tool) or the AI's choices.
    class ProposePalette < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          plants: {
            type: "array", minItems: 1, maxItems: PaletteProposal::MAX_PLANTS, description: :plants,
            items: {
              type: "object", additionalProperties: false, required: %w[rationale],
              properties: {
                species_id: { type: "integer", minimum: 1, description: :species_id },
                name: { type: "string", maxLength: 200, description: :plant_name },
                variety_id: { type: "integer", minimum: 1, description: :variety_id },
                strata: { type: "string", enum: PaletteItem::STRATA, description: :strata },
                role: { type: "string", enum: PaletteItem::ROLES, description: :role },
                target_count: { type: "integer", minimum: 1, maximum: 999_999, description: :target_count },
                notes: { type: "string", maxLength: 2000, description: :plant_notes },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :plant_rationale }
              }
            }
          }
        },
        required: %w[map_id plants]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, plants:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        outcome = PaletteProposal.new(map:, user:).call(plants)
        if outcome.created.empty?
          details = outcome.rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_created", details:)
        end
        {
          created: outcome.created.map { |c| { index: c[:index], id: c[:item].id, species_id: c[:item].species_id, name: c[:item].display_name } },
          rejected: outcome.rejected,
          pending_palette_drafts: map.palette_drafts.count,
          review_url: map_url(map),
          next_step: t("notes.review_palette")
        }
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], summary: arguments[:summary]&.first(200), plants: Array(arguments[:plants]).size }.compact
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
