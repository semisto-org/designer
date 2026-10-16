module Mcp
  module Tools
    # Withdraws drafts an AI proposed and nobody reviewed yet: new elements
    # (feature_ids) and proposed changes to existing ones (update_ids).
    # Accepted elements and changes belong to the humans: they cannot be
    # withdrawn.
    class WithdrawDraft < Base
      requirement :withdraw
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: DraftProposal::MAX_FEATURES,
            uniqueItems: true, description: :feature_ids
          },
          update_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: UpdateProposal::MAX_FILTERED,
            uniqueItems: true, description: :update_ids
          }
        },
        required: %w[map_id]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(map_id:, feature_ids: nil, update_ids: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        raise ToolError, t("errors.withdraw_nothing") if feature_ids.blank? && update_ids.blank?
        result = {}
        if feature_ids.present?
          drafts = map.features.drafts.where(source: "ai", id: feature_ids).to_a
          MapFeature.no_touching { drafts.each(&:destroy!) }
          map.touch if drafts.any?
          withdrawn = drafts.map(&:id)
          result.merge!(withdrawn:, not_found: feature_ids - withdrawn, pending_drafts: map.features.drafts.count)
        end
        if update_ids.present?
          updates = map.feature_update_drafts.pending.where(id: update_ids)
          withdrawn = updates.pluck(:id)
          updates.update_all(status: "withdrawn", updated_at: Time.current)
          result.merge!(withdrawn_updates: withdrawn, updates_not_found: update_ids - withdrawn,
            pending_update_drafts: map.feature_update_drafts.pending.count)
        end
        result
      end

      private
        def summarize_result(data)
          ids = Array(data[:withdrawn])
          { withdrawn: ids.size + Array(data[:withdrawn_updates]).size, feature_ids: ids, update_ids: data[:withdrawn_updates] }.compact
        end
    end
  end
end
