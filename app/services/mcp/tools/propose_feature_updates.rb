module Mcp
  module Tools
    # Proposes changes to elements already on the map (planting date,
    # species, name, tags, notes, position). Like new drafts, nothing changes
    # until a person accepts them in the editor, one by one or all at once.
    # Two ways to call it: a list of updates (one per element), or a filter
    # with the same changes for every active element it selects.
    class ProposeFeatureUpdates < Base
      CHANGES_SCHEMA = {
        type: "object", minProperties: 1, description: :changes,
        properties: {
          name: { type: %w[string null], maxLength: 120, description: :change_name },
          notes: { type: %w[string null], maxLength: 2000, description: :change_notes },
          tags: {
            type: "array", maxItems: MapFeature::Tags::MAX_TAGS, description: :change_tags,
            items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
          },
          properties: { type: "object", minProperties: 1, maxProperties: 30, description: :change_properties },
          geometry: {
            type: "object", required: %w[type coordinates], description: :change_geometry,
            properties: {
              type: { type: "string", enum: ProposeFeatures::GEOMETRY_TYPES },
              coordinates: { type: "array", minItems: 1 }
            }
          }
        }
      }.freeze
      RATIONALE_SCHEMA = { type: "string", minLength: 10, maxLength: 2000, description: :update_rationale }.freeze

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          updates: {
            type: "array", minItems: 1, maxItems: UpdateProposal::MAX_UPDATES, description: :updates,
            items: {
              type: "object", additionalProperties: false, required: %w[feature_id changes rationale],
              properties: {
                feature_id: { type: "integer", minimum: 1, description: :feature_id },
                changes: CHANGES_SCHEMA,
                rationale: RATIONALE_SCHEMA
              }
            }
          },
          filter: {
            type: "object", additionalProperties: false, minProperties: 1, description: :filter,
            properties: {
              tag: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :tag },
              kind: { type: "string", minLength: 1, maxLength: 60, description: :kind },
              layer: { type: "string", enum: DraftProposal::LAYERS, description: :filter_layer },
              species_id: { type: "integer", minimum: 1, description: :filter_species_id },
              ids: {
                type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: UpdateProposal::MAX_FILTERED,
                uniqueItems: true, description: :filter_ids
              }
            }
          },
          changes: CHANGES_SCHEMA,
          rationale: RATIONALE_SCHEMA
        },
        required: %w[map_id]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, summary: nil, updates: nil, filter: nil, changes: nil, rationale: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        items, targeted = items_for(map, updates:, filter:, changes:, rationale:)
        outcome = UpdateProposal.new(map:, user:, client_name: principal.client_name, summary:).call(items)
        if outcome.created.empty? && outcome.unchanged.empty?
          details = outcome.rejected.first(10).map { |r| "##{r[:feature_id]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_proposed", details:)
        end
        {
          batch: outcome.created.any? ? outcome.batch : nil,
          targeted:,
          created: outcome.created.map { |c| c.except(:index) },
          unchanged: outcome.unchanged.map { |u| u.except(:index) },
          rejected: outcome.rejected.map { |r| r.except(:index) },
          pending_update_drafts: map.feature_update_drafts.pending.count,
          review_url: map_url(map),
          next_step: t(outcome.created.any? ? "notes.review_updates" : "notes.nothing_new")
        }.compact
      end

      private
        def items_for(map, updates:, filter:, changes:, rationale:)
          if updates && filter
            raise ToolError, t("errors.updates_or_filter")
          elsif updates
            raise ToolError, t("errors.filter_only_arguments") if changes || rationale
            [ updates.map { |u| u.to_h.deep_symbolize_keys }, nil ]
          elsif filter
            raise ToolError, t("errors.filter_needs_changes") unless changes && rationale
            error = UpdateProposal.changes_error(changes)
            raise ToolError, t("errors.invalid_changes", error:) if error
            ids = filtered_ids(map, filter.to_h.deep_symbolize_keys)
            item = { changes: changes.to_h.deep_symbolize_keys, rationale: }
            [ ids.map { |id| item.merge(feature_id: id) }, ids.size ]
          else
            raise ToolError, t("errors.updates_or_filter")
          end
        end

        # The active elements the filter selects (never the networks), in id order.
        def filtered_ids(map, filter)
          scope = map.features.active.where.not(layer: "networks")
          scope = scope.tagged(filter[:tag]) if filter[:tag]
          scope = scope.where(kind: filter[:kind]) if filter[:kind]
          scope = scope.where(layer: filter[:layer]) if filter[:layer]
          scope = scope.where("map_features.properties->>'species_id' = ?", filter[:species_id].to_s) if filter[:species_id]
          scope = scope.where(id: filter[:ids]) if filter[:ids]
          count = scope.count
          raise ToolError, t("errors.filter_nothing") if count.zero?
          raise ToolError, t("errors.filter_too_many", count:, max: UpdateProposal::MAX_FILTERED) if count > UpdateProposal::MAX_FILTERED
          scope.order(:id).pluck(:id)
        end

        def summarize_arguments(arguments)
          {
            map_id: arguments[:map_id], summary: arguments[:summary].to_s.first(1000).presence,
            updates: arguments[:updates]&.size, filter: arguments[:filter],
            fields: (arguments[:changes] || Array(arguments[:updates]).first.to_h[:changes]).to_h.keys.presence
          }.compact
        end

        def summarize_result(data)
          {
            created: data[:created].size, unchanged: data[:unchanged].size, rejected: data[:rejected].size,
            update_ids: data[:created].map { |c| c[:id] }, feature_ids: data[:created].map { |c| c[:feature_id] }
          }
        end
    end
  end
end
