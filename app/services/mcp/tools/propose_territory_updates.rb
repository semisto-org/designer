module Mcp
  module Tools
    # Proposes changes to entries of a territory's dossier that a person
    # already kept: a lead's land once the owner is known, its keeper, a
    # marker's proof once someone saw it, a source's excerpts. Nothing
    # changes until a person accepts it on the territory's page, all of it or
    # field by field. A new proposal replaces the entry's pending one;
    # withdraw_territory_drafts withdraws it (update_ids).
    class ProposeTerritoryUpdates < Base
      include TerritoryAccess

      MAX_UPDATES = 100

      requirement :propose
      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          updates: {
            type: "array", minItems: 1, maxItems: MAX_UPDATES, description: :territory_updates,
            items: {
              type: "object", additionalProperties: false, required: %w[item_id changes rationale],
              properties: {
                item_id: { type: "integer", minimum: 1, description: :territory_item_id },
                changes: {
                  type: "object", additionalProperties: false, minProperties: 1, description: :territory_changes,
                  properties: {
                    title: { type: "string", minLength: 2, maxLength: TerritoryItem::TITLE_MAX_LENGTH },
                    body: { type: [ "string", "null" ], maxLength: 6000 },
                    geometry: { type: [ "object", "null" ] },
                    properties: { type: "object", minProperties: 1 }
                  }
                },
                rationale: { type: "string", minLength: 10, maxLength: 3000, description: :territory_item_rationale }
              }
            }
          }
        },
        required: %w[territory_id updates]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(territory_id:, updates:)
        territory = find_territory!(territory_id)
        require_drafts_scope!
        require_territory_editor!(territory)

        ids = updates.map { |u| u.to_h.deep_stringify_keys["item_id"].to_i }
        items = territory.items.where(id: ids).index_by(&:id)
        pending = territory.item_updates.pending.where(territory_item_id: ids).index_by(&:territory_item_id)
        valid, unchanged, rejected = [], [], []
        seen = Set.new
        updates.each_with_index do |raw, index|
          raw = raw.to_h.deep_stringify_keys
          item = items[raw["item_id"].to_i]
          if (error = item_error(raw["item_id"], item, seen))
            rejected << { index:, item_id: raw["item_id"], error: }
            next
          end
          seen << item.id
          changes, error = TerritoryItemUpdate.normalize(item, raw["changes"])
          error ||= candidate_error(item, changes) if changes.present?
          if error
            rejected << { index:, item_id: item.id, error: }
          elsif changes.empty?
            unchanged << { index:, item_id: item.id, reason: t("territory_update_errors.same_as_current") }
          elsif pending[item.id]&.proposed_changes == changes
            unchanged << { index:, item_id: item.id, reason: t("territory_update_errors.already_pending", id: pending[item.id].id) }
          else
            valid << [ index, item, changes, raw["rationale"].to_s.strip ]
          end
        end
        if valid.empty? && unchanged.empty?
          raise ToolError, t("errors.nothing_proposed", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end

        created = TerritoryItemUpdate.transaction do
          batch = SecureRandom.uuid
          valid.map do |index, item, changes, rationale|
            replaced = pending[item.id]
            replaced&.update!(status: "withdrawn")
            update = territory.item_updates.create!(
              territory_item: item, item_title: item.title, batch:, proposed_changes: changes, rationale:,
              created_by: user, client_name: principal.client_name&.first(100)
            )
            { index:, id: update.id, item_id: item.id, fields: TerritoryItemUpdate.leaves(changes).map(&:first), replaces: replaced&.id }.compact
          end
        end
        {
          created:, unchanged:, rejected:, review_url: territory_url(territory),
          next_step: t(created.any? ? "notes.review_territory_updates" : "notes.nothing_new")
        }
      end

      private
        def item_error(id, item, seen)
          return t("territory_update_errors.not_found", id:) if item.nil? || item.status == "rejected"
          return t("territory_update_errors.draft", id:) if item.draft?
          t("territory_update_errors.twice", id:) if seen.include?(item.id)
        end

        # The entry as it would be with every proposed change, checked like a
        # person's own edit (place, sub-basin, schema).
        def candidate_error(item, changes)
          TerritoryItemUpdate.leaves(changes).each { |path, value| TerritoryItemUpdate.assign(item, path, value) }
          item.valid? ? nil : item.errors.full_messages.to_sentence
        rescue RGeo::Error::ParseError, JSON::ParserError, NoMethodError
          t("errors.territory_geometry")
        ensure
          item.reload
        end

        def summarize_arguments(arguments)
          { territory_id: arguments[:territory_id], updates: Array(arguments[:updates]).size }
        end

        def summarize_result(data)
          { created: data[:created].size, unchanged: data[:unchanged].size, rejected: data[:rejected].size, update_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
