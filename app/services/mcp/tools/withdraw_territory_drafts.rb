module Mcp
  module Tools
    # Withdraws drafts an AI proposed on a territory and nobody reviewed yet,
    # and pending changes or removals it proposed to kept entries
    # (update_ids). What a person kept belongs to the people: it cannot be
    # withdrawn.
    class WithdrawTerritoryDrafts < Base
      include TerritoryAccess

      requirement :withdraw
      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          item_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1,
            maxItems: ProposeTerritoryItems::MAX_ITEMS * 5, uniqueItems: true, description: :territory_item_ids
          },
          update_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1,
            maxItems: ProposeTerritoryUpdates::MAX_UPDATES * 5, uniqueItems: true, description: :territory_update_ids
          }
        },
        required: %w[territory_id]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(territory_id:, item_ids: [], update_ids: [])
        territory = find_territory!(territory_id)
        require_drafts_scope!
        require_territory_editor!(territory)
        raise ToolError, t("errors.territory_nothing_to_withdraw") if item_ids.empty? && update_ids.empty?
        drafts = territory.items.drafts.where(id: item_ids, source: "ai")
        withdrawn = drafts.pluck(:id)
        drafts.destroy_all
        updates = territory.item_updates.pending.where(id: update_ids)
        withdrawn_updates = updates.pluck(:id)
        updates.update_all(status: "withdrawn", updated_at: Time.current)
        {
          withdrawn:, not_withdrawn: item_ids - withdrawn,
          withdrawn_updates:, not_withdrawn_updates: update_ids - withdrawn_updates,
          review_url: territory_url(territory)
        }
      end

      private
        def summarize_result(data) = { withdrawn: data[:withdrawn].size, withdrawn_updates: data[:withdrawn_updates].size }
    end
  end
end
