# Composition of a patch (a MapFeature of kind "patch"): which plants, at
# what density (plants/m²) or as a fixed count. Quantities are computed from
# the patch area measured by PostGIS, never stored.
class CreatePatchItems < ActiveRecord::Migration[8.1]
  def change
    create_table :patch_items do |t|
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :species, null: false, foreign_key: { to_table: :plant_species }
      t.references :variety, foreign_key: { to_table: :plant_varieties }
      t.string :strata
      t.decimal :density, precision: 8, scale: 3
      t.integer :count
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :patch_items, %i[map_feature_id species_id], unique: true, where: "variety_id IS NULL",
              name: "index_patch_items_unique_species"
    add_index :patch_items, %i[map_feature_id variety_id], unique: true, where: "variety_id IS NOT NULL",
              name: "index_patch_items_unique_variety"
  end
end
