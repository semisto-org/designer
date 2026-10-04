# « Transférer la carte »: the owner proposes the map to one of its editors,
# who accepts or declines within 14 days. One pending proposal per map (the
# partial unique index); the rows stay as the map's history afterwards.
class CreateMapTransfers < ActiveRecord::Migration[8.1]
  def change
    create_table :map_transfers do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :from_user, null: false, foreign_key: { to_table: :users, on_delete: :cascade }
      t.references :to_user, null: false, index: false, foreign_key: { to_table: :users, on_delete: :cascade }
      # pending | accepted | declined | canceled | expired | invalidated
      t.string :status, null: false, default: "pending"
      t.datetime :expires_at, null: false
      t.datetime :closed_at
      t.timestamps
    end
    add_index :map_transfers, :map_id, unique: true, where: "status = 'pending'", name: "index_map_transfers_one_pending_per_map"
    add_index :map_transfers, %i[to_user_id status] # the recipient's pending proposals
  end
end
