# A gardener asks a place's owners for material of a plant they have in the
# ground (scions, cuttings, seeds…). Contacts are exchanged only once an
# owner accepts.
class CreatePropagationRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :propagation_requests do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :species, null: false, foreign_key: { to_table: :plant_species, on_delete: :cascade }
      t.references :variety, foreign_key: { to_table: :plant_varieties, on_delete: :nullify }
      t.references :requester, null: false, foreign_key: { to_table: :users, on_delete: :cascade }
      t.string :material, null: false
      t.text :message, null: false
      t.string :status, null: false, default: "pending"
      t.text :answer
      t.references :answered_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :answered_at
      t.timestamps
    end
    add_index :propagation_requests, %i[map_id status]
  end
end
