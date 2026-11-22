module Mcp
  module Tools
    # The first tracing sheet of a design (« Feuilles du dessin »): bubbles,
    # loose surfaces that say an intention (« Cueillir près de la maison »,
    # « Garder l'eau en bas ») before any element, each linked to the
    # project's functions it answers. Drafts, like every AI proposal: the
    # person reviews them in the editor, then translates them into the frame
    # (water, access, structure) and the planting.
    class ProposeBubbles < Base
      MAX_BUBBLES = 20
      # The soft palette of the editor's zones (map/zones/zones.ts, ZONE_COLORS).
      COLORS = %w[#7fa650 #8b5e3c #d08b3a #c48a96 #5b7fa6 #9a7fb8 #c9b03a #4f8f86].freeze

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          variant_id: { type: "integer", minimum: 1, description: :variant_id },
          bubbles: {
            type: "array", minItems: 1, maxItems: MAX_BUBBLES, description: :bubbles,
            items: {
              type: "object", additionalProperties: false,
              required: %w[name geometry rationale],
              properties: {
                name: { type: "string", minLength: 1, maxLength: 120, description: :bubble_name },
                geometry: {
                  type: "object", additionalProperties: false, required: %w[type coordinates], description: :bubble_geometry,
                  properties: {
                    type: { type: "string", enum: %w[Polygon] },
                    coordinates: { type: "array", minItems: 1 }
                  }
                },
                serves: {
                  type: "array", maxItems: 20, uniqueItems: true, description: :bubble_serves,
                  items: { type: "string", minLength: 1, maxLength: 64 }
                },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :feature_rationale }
              }
            }
          }
        },
        required: %w[map_id bubbles]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, bubbles:, summary: nil, variant_id: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        variant = variant_id && (map.variants.find_by(id: variant_id) or raise ToolError, t("errors.unknown_variant"))
        known = ProjectSheet.parse(map.project, strict: false).project_functions.map { |f| f[:id].to_s }
        unknown = bubbles.flat_map { |b| Array(b[:serves]).map(&:to_s) }.uniq - known
        raise ToolError, t("errors.unknown_functions", ids: unknown.join(", ")) if unknown.any?

        used = map.features.where(kind: "bubble").count
        items = bubbles.each_with_index.map do |bubble, index|
          serves = Array(bubble[:serves]).map(&:to_s).uniq
          {
            layer: "drawings", kind: "bubble", geometry: bubble[:geometry], name: bubble[:name], rationale: bubble[:rationale],
            color: COLORS[(used + index) % COLORS.size],
            properties: { rounded: true }.merge(serves.any? ? { serves: } : {})
          }
        end
        outcome = DraftProposal.new(map:, user:, variant:).call(items)
        if outcome.created.empty?
          details = outcome.rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_created", details:)
        end
        {
          created: outcome.created.map { |f| { index: f[:index], id: f[:feature].id, name: f[:feature].name, serves: f[:feature].properties["serves"] }.compact },
          rejected: outcome.rejected,
          pending_drafts: map.features.drafts.count,
          review_url: map_url(map),
          next_step: t("notes.review_bubbles")
        }
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], summary: arguments[:summary].to_s.first(1000).presence, bubbles: Array(arguments[:bubbles]).size }.compact
        end

        def summarize_result(data)
          { created: data[:created].size, feature_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
