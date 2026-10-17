# Readings of a fruit store (a MapFeature of kind "fruit_store": cellar,
# cold room, barn): temperature and humidity on a day, with the min and max
# of a min-max thermometer when there is one. Tells which place keeps fruit
# through the winter.
class CreateStorageReadings < ActiveRecord::Migration[8.1]
  def change
    create_table :storage_readings do |t|
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.date :measured_on, null: false
      t.decimal :temperature_c, precision: 4, scale: 1
      t.decimal :temperature_min_c, precision: 4, scale: 1
      t.decimal :temperature_max_c, precision: 4, scale: 1
      t.integer :humidity_pct
      t.text :note
      t.timestamps
    end
    add_index :storage_readings, %i[map_feature_id measured_on]
    add_index :storage_readings, %i[map_id measured_on]
  end
end
