# The palette of a map: the species (or cultivars) chosen for this terrain,
# with the strata they play here, their role and a target count.
class CreatePaletteItems < ActiveRecord::Migration[8.1]
  def change
    create_table :palette_items do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :species, null: false, foreign_key: { to_table: :plant_species }
      t.references :variety, foreign_key: { to_table: :plant_varieties }
      # Override of the species' strata on this design (nil = species default).
      t.string :strata
      t.string :role
      t.text :notes
      t.integer :target_count
      t.integer :position, null: false, default: 0
      t.references :created_by, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :palette_items, %i[map_id species_id], unique: true, where: "variety_id IS NULL",
              name: "index_palette_items_unique_species"
    add_index :palette_items, %i[map_id variety_id], unique: true, where: "variety_id IS NOT NULL",
              name: "index_palette_items_unique_variety"
  end
end
