module Mcp
  module Tools
    # Withdraws drafts an AI proposed and nobody reviewed yet. Accepted
    # elements belong to the humans: they cannot be withdrawn.
    class WithdrawDraft < Base
      requirement :withdraw
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: DraftProposal::MAX_FEATURES,
            uniqueItems: true, description: :feature_ids
          }
        },
        required: %w[map_id feature_ids]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(map_id:, feature_ids:)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        drafts = map.features.drafts.where(source: "ai", id: feature_ids).to_a
        MapFeature.no_touching { drafts.each(&:destroy!) }
        map.touch if drafts.any?
        withdrawn = drafts.map(&:id)
        { withdrawn:, not_found: feature_ids - withdrawn, pending_drafts: map.features.drafts.count }
      end

      private
        def summarize_result(data) = { withdrawn: data[:withdrawn].size, feature_ids: data[:withdrawn] }
    end
  end
end
