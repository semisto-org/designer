class CreateEcoMeasurements < ActiveRecord::Migration[8.1]
  def change
    create_table :eco_measurements do |t|
      t.string :screen, null: false
      t.string :environment, null: false
      t.string :url, null: false
      t.integer :dom_elements, null: false
      t.integer :requests, null: false
      t.integer :bytes, null: false
      t.integer :score, null: false
      t.string :grade, null: false
      t.decimal :ges_grams, precision: 5, scale: 2, null: false
      t.decimal :water_centiliters, precision: 5, scale: 2, null: false
      t.string :commit
      t.datetime :measured_at, null: false
      t.timestamps
    end
    add_index :eco_measurements, [ :screen, :measured_at ]
  end
end
