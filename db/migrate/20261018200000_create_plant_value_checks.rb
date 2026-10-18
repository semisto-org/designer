# What open sources (PFAF, Wikipédia) say about each value of a proposed
# species, as judged by Jev (Catalog::ValueCheck), for the catalogue review.
class CreatePlantValueChecks < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_value_checks do |t|
      t.references :species, null: false, index: false, foreign_key: { to_table: :plant_species, on_delete: :cascade }
      t.string :field, null: false
      t.string :verdict, null: false
      t.jsonb :source_value
      t.float :confidence
      t.string :source
      t.string :url
      t.text :excerpt
      t.timestamps
    end
    add_index :plant_value_checks, %i[species_id field], unique: true

    add_column :plant_species, :values_check_requested_at, :datetime
    add_column :plant_species, :values_checked_at, :datetime
    add_column :plant_species, :values_check_error, :string
  end
end
