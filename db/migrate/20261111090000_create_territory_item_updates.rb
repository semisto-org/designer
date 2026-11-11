# Changes an AI proposes to an entry of a territory's dossier that a person
# already kept (MCP propose_territory_updates), or its removal
# (propose_territory_deletions). Each waits, "pending", until a person
# accepts it field by field, rejects it, or the AI withdraws or replaces it.
# An accepted one stays as the entry's history.
#
# Also turns the excerpts of a source into a list: they were one text, and
# an AI that sent a list got its JSON back as a string.
class CreateTerritoryItemUpdates < ActiveRecord::Migration[8.1]
  class Item < ActiveRecord::Base
    self.table_name = "territory_items"
  end

  def up
    create_table :territory_item_updates do |t|
      t.references :territory, null: false, foreign_key: { on_delete: :cascade }, index: false
      # Kept as history when an accepted removal deletes the entry.
      t.references :territory_item, foreign_key: { on_delete: :nullify }
      t.string :item_title, null: false
      t.string :batch, null: false
      # { "title", "body", "geometry", "properties" => { … nil removes } } or { "delete" => true }
      t.jsonb :proposed_changes, null: false, default: {}
      t.text :rationale, null: false
      t.string :status, null: false, default: "pending"
      t.string :client_name
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at
      t.jsonb :applied_changes
      t.jsonb :previous_values
      t.timestamps
    end
    add_index :territory_item_updates, %i[territory_id status]
    add_index :territory_item_updates, :territory_item_id, unique: true, where: "status = 'pending'", name: "index_territory_item_updates_one_pending"

    Item.where(kind: "source").where("properties ? 'excerpts'").find_each do |item|
      value = item.properties["excerpts"]
      next unless value.is_a?(String)
      list = begin
        parsed = JSON.parse(value) if value.strip.start_with?("[")
        parsed.is_a?(Array) ? parsed.map(&:to_s) : nil
      rescue JSON::ParserError
        nil
      end
      list ||= value.split(/\n\s*\n/)
      list = list.map(&:strip).reject(&:empty?)
      item.update_columns(properties: list.any? ? item.properties.merge("excerpts" => list) : item.properties.except("excerpts"))
    end
  end

  def down
    Item.where(kind: "source").where("properties ? 'excerpts'").find_each do |item|
      value = item.properties["excerpts"]
      item.update_columns(properties: item.properties.merge("excerpts" => value.join("\n\n"))) if value.is_a?(Array)
    end
    drop_table :territory_item_updates
  end
end
