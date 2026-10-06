module Mcp
  module Tools
    # The only way an AI writes on a map: drafts, each with its rationale,
    # that a human accepts, adjusts or rejects one by one in the editor.
    class ProposeFeatures < Base
      GEOMETRY_TYPES = %w[Point LineString Polygon MultiPoint MultiLineString MultiPolygon].freeze

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          features: {
            type: "array", minItems: 1, maxItems: DraftProposal::MAX_FEATURES, description: :features,
            items: {
              type: "object", additionalProperties: false,
              required: %w[layer kind geometry rationale],
              properties: {
                layer: { type: "string", enum: DraftProposal::LAYERS, description: :feature_layer },
                kind: { type: "string", pattern: "^[a-z][a-z0-9_]{0,59}$", description: :feature_kind },
                geometry: {
                  type: "object", additionalProperties: false, required: %w[type coordinates], description: :feature_geometry,
                  properties: {
                    type: { type: "string", enum: GEOMETRY_TYPES },
                    coordinates: { type: "array", minItems: 1 }
                  }
                },
                name: { type: "string", maxLength: 120, description: :feature_name },
                notes: { type: "string", maxLength: 2000, description: :feature_notes },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :feature_rationale },
                tags: {
                  type: "array", maxItems: MapFeature::Tags::MAX_TAGS, description: :feature_tags,
                  items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
                },
                properties: { type: "object", maxProperties: 30, description: :feature_properties }
              }
            }
          }
        },
        required: %w[map_id features]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, features:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        outcome = DraftProposal.new(map:, user:).call(features)
        if outcome.created.empty?
          details = outcome.rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_created", details:)
        end
        {
          created: outcome.created.map { |f| { index: f[:index], id: f[:feature].id, layer: f[:feature].layer, kind: f[:feature].kind, name: f[:feature].name }.compact },
          rejected: outcome.rejected,
          pending_drafts: map.features.drafts.count,
          review_url: map_url(map),
          next_step: t("notes.review")
        }
      end

      private
        def summarize_arguments(arguments)
          list = Array(arguments[:features])
          {
            map_id: arguments[:map_id], summary: arguments[:summary].to_s.first(1000).presence,
            features: list.size,
            layers: list.group_by { |f| f.is_a?(Hash) ? f[:layer].to_s : "?" }.transform_values(&:size)
          }.compact
        end

        def summarize_result(data)
          { created: data[:created].size, rejected: data[:rejected].size, feature_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
