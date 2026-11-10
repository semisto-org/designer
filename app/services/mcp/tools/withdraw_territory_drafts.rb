module Mcp
  module Tools
    # Withdraws drafts an AI proposed on a territory and nobody reviewed yet.
    # What a person kept belongs to the people: it cannot be withdrawn.
    class WithdrawTerritoryDrafts < Base
      include TerritoryAccess

      requirement :withdraw
      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          item_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1,
            maxItems: ProposeTerritoryItems::MAX_ITEMS * 5, uniqueItems: true, description: :territory_item_ids
          }
        },
        required: %w[territory_id item_ids]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(territory_id:, item_ids:)
        territory = find_territory!(territory_id)
        require_drafts_scope!
        require_territory_editor!(territory)
        drafts = territory.items.drafts.where(id: item_ids, source: "ai")
        withdrawn = drafts.pluck(:id)
        drafts.destroy_all
        { withdrawn:, not_withdrawn: item_ids - withdrawn, review_url: territory_url(territory) }
      end

      private
        def summarize_result(data) = { withdrawn: data[:withdrawn].size }
    end
  end
end
