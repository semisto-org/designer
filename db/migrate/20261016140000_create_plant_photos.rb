class CreatePlantPhotos < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_photos do |t|
      t.references :species, null: false, foreign_key: { to_table: :plant_species, on_delete: :cascade }
      t.integer :position, null: false, default: 0
      t.string :source, null: false, default: "wikimedia_commons"
      t.string :file_title, null: false
      t.string :author
      t.string :license, null: false
      t.string :license_url
      t.string :page_url, null: false
      t.integer :width
      t.integer :height
      t.timestamps
    end
    add_index :plant_photos, %i[species_id file_title], unique: true
    add_column :plant_species, :photo_looked_up_at, :datetime
  end
end
