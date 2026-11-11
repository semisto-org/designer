module Mcp
  module Tools
    # Proposes to remove entries a person kept in a territory's dossier (a
    # source that turned out to be a copy, a marker placed twice). Nothing is
    # removed until a person accepts it on the territory's page. A proposed
    # removal is a TerritoryItemUpdate ({ "delete" => true }): it replaces the
    # entry's pending change, and withdraw_territory_drafts withdraws it.
    # A draft is not removed this way: withdraw_territory_drafts takes it back.
    class ProposeTerritoryDeletions < Base
      include TerritoryAccess

      requirement :propose
      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          item_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1,
            maxItems: ProposeTerritoryUpdates::MAX_UPDATES, uniqueItems: true, description: :territory_deletion_ids
          },
          rationale: { type: "string", minLength: 10, maxLength: 3000, description: :territory_deletion_rationale }
        },
        required: %w[territory_id item_ids rationale]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(territory_id:, item_ids:, rationale:)
        territory = find_territory!(territory_id)
        require_drafts_scope!
        require_territory_editor!(territory)

        items = territory.items.where(id: item_ids).index_by(&:id)
        pending = territory.item_updates.pending.where(territory_item_id: item_ids).index_by(&:territory_item_id)
        valid, unchanged, rejected = [], [], []
        item_ids.each do |id|
          item = items[id]
          if item.nil? || item.status == "rejected"
            rejected << { item_id: id, error: t("territory_update_errors.not_found", id:) }
          elsif item.draft?
            rejected << { item_id: id, error: t("territory_update_errors.draft_deletion", id:) }
          elsif pending[id]&.deletion?
            unchanged << { item_id: id, reason: t("territory_update_errors.already_pending", id: pending[id].id) }
          else
            valid << item
          end
        end
        if valid.empty? && unchanged.empty?
          raise ToolError, t("errors.nothing_proposed", details: rejected.first(10).map { |r| "##{r[:item_id]} : #{r[:error]}" }.join(" ; "))
        end

        created = TerritoryItemUpdate.transaction do
          batch = SecureRandom.uuid
          valid.map do |item|
            replaced = pending[item.id]
            replaced&.update!(status: "withdrawn")
            update = territory.item_updates.create!(
              territory_item: item, item_title: item.title, batch:, proposed_changes: TerritoryItemUpdate::DELETION,
              rationale: rationale.strip, created_by: user, client_name: principal.client_name&.first(100)
            )
            { id: update.id, item_id: item.id, kind: item.kind, title: item.title, replaces: replaced&.id }.compact
          end
        end
        {
          created:, unchanged:, rejected:, review_url: territory_url(territory),
          next_step: t(created.any? ? "notes.review_territory_deletions" : "notes.nothing_new")
        }
      end

      private
        def summarize_arguments(arguments)
          { territory_id: arguments[:territory_id], item_ids: Array(arguments[:item_ids]).size }
        end

        def summarize_result(data)
          { created: data[:created].size, unchanged: data[:unchanged].size, rejected: data[:rejected].size, update_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
