# The map packed as a website that opens without Terranova (INTENT,
# « Nothing is taken hostage »): one per map, rebuilt on request.
class CreateMapOfflineSites < ActiveRecord::Migration[8.1]
  def change
    create_table :map_offline_sites do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.references :requested_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :status, null: false, default: "pending"
      t.boolean :include_networks, null: false, default: false
      t.jsonb :summary, null: false, default: {}
      t.string :error
      t.datetime :finished_at
      t.timestamps
    end
  end
end
