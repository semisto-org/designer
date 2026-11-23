# A correction someone suggests for a species of the shared catalogue
# (« Suggérer une correction » on the sheet, or their AI through the MCP),
# waiting for a catalogue reviewer.
class CreatePlantCorrections < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_corrections do |t|
      t.references :species, null: false, foreign_key: { to_table: :plant_species, on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :field, null: false
      t.jsonb :current_value
      t.jsonb :proposed_value
      t.text :note
      t.string :source_url
      t.string :origin, null: false, default: "web"
      t.string :status, null: false, default: "pending"
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at
      t.timestamps
    end
    add_index :plant_corrections, :status
  end
end
