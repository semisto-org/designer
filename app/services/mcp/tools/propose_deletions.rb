module Mcp
  module Tools
    # Proposes to remove elements already on the map (a plant, a pond, a
    # path…). Like every change an AI proposes, nothing happens until a person
    # accepts it in the editor, one by one or all at once; an accepted
    # deletion puts the element in the map's trash, where « Annuler » (⌘Z)
    # finds it for MapFeature::Trash::KEEP_FOR. A proposed deletion is a
    # FeatureUpdateDraft ({ "delete" => true }): it shows in the same review
    # card, it replaces the element's pending change, and withdraw_draft
    # withdraws it (update_ids).
    class ProposeDeletions < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          feature_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: UpdateProposal::MAX_FILTERED,
            uniqueItems: true, description: :feature_ids
          },
          rationale: { type: "string", minLength: 10, maxLength: 2000, description: :rationale }
        },
        required: %w[map_id feature_ids rationale]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, feature_ids:, rationale:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        rationale = rationale.to_s.strip
        raise ToolError, I18n.t("mcp.update_errors.rationale") if rationale.length < 10

        features = map.features.where(id: feature_ids).index_by(&:id)
        pending = map.feature_update_drafts.pending.where(map_feature_id: feature_ids).index_by(&:map_feature_id)
        valid, unchanged, rejected = [], [], []
        feature_ids.each do |id|
          feature = features[id]
          if (error = item_error(id, feature))
            rejected << { feature_id: id, error: }
          elsif pending[id]&.deletion?
            unchanged << { feature_id: id, reason: I18n.t("mcp.update_errors.already_pending", id: pending[id].id) }
          else
            valid << feature
          end
        end
        if valid.empty? && unchanged.empty?
          details = rejected.first(10).map { |r| "##{r[:feature_id]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_proposed", details:)
        end

        waiting = map.feature_update_drafts.pending.count - valid.count { |feature| pending[feature.id] }
        if waiting + valid.size > UpdateProposal::MAX_PENDING
          raise ToolError, t("errors.too_many_pending_updates", max: UpdateProposal::MAX_PENDING, pending: waiting)
        end

        batch = SecureRandom.uuid
        created = create(map, batch, valid, pending, rationale:, summary: summary.to_s.strip.first(1000).presence)
        {
          batch: created.any? ? batch : nil,
          created:, unchanged:, rejected:,
          pending_update_drafts: map.feature_update_drafts.pending.count,
          review_url: map_url(map),
          next_step: t(created.any? ? "notes.review_deletions" : "notes.nothing_new")
        }.compact
      end

      private
        def item_error(id, feature)
          return I18n.t("mcp.update_errors.not_found", id:) unless feature
          return I18n.t("mcp.update_errors.not_active", status: feature.status) unless feature.status == "active"
          I18n.t("mcp.update_errors.networks") if feature.layer == "networks"
        end

        # A new proposal replaces the element's pending change, whatever it was.
        def create(map, batch, features, pending, rationale:, summary:)
          return [] if features.empty?
          FeatureUpdateDraft.transaction do
            replaced = features.filter_map { |feature| pending[feature.id]&.id }
            FeatureUpdateDraft.where(id: replaced).update_all(status: "withdrawn", updated_at: Time.current) if replaced.any?
            features.map do |feature|
              draft = map.feature_update_drafts.create!(
                map_feature: feature, batch:, summary:, proposed_changes: FeatureUpdateDraft::DELETION, rationale:,
                created_by: user, client_name: principal.client_name&.first(100)
              )
              { id: draft.id, feature_id: feature.id, layer: feature.layer, kind: feature.kind, name: feature.name, replaces: pending[feature.id]&.id }.compact
            end
          end
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], summary: arguments[:summary].to_s.first(1000).presence, feature_ids: arguments[:feature_ids]&.size }.compact
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
