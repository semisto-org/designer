# Harvest log of a plant (a MapFeature of kind "plant"), season after season:
# « porte des fruits » noted on the tree, then « récolté » with what it gave
# and where it went (juice, compote, table, storage). Tells which trees bore,
# year after year, to choose what to renew.
class CreatePlantHarvests < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_harvests do |t|
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      # Denormalised at creation, like plant_observations.
      t.references :species, foreign_key: { to_table: :plant_species, on_delete: :nullify }
      t.references :variety, foreign_key: { to_table: :plant_varieties, on_delete: :nullify }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.date :noted_on, null: false
      # on_tree (porte des fruits) | picked (récolté)
      t.string :stage, null: false
      # none | light | normal | heavy
      t.string :amount
      t.decimal :quantity_kg, precision: 8, scale: 1
      # juice | cooking | fresh | storage | other
      t.string :uses, array: true, default: [], null: false
      t.text :note
      t.timestamps
    end
    add_index :plant_harvests, %i[map_id noted_on]
    add_index :plant_harvests, %i[map_feature_id noted_on]
  end
end
