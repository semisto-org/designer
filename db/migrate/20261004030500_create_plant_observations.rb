# "Planté → observé": follow-up of a planted plant (a MapFeature of kind
# "plant"): did it take, how vigorous, a note and a photo. Aggregated per
# species, anonymously, on the catalogue sheet.
class CreatePlantObservations < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_observations do |t|
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      # Denormalised at creation so the catalogue can aggregate without
      # reading every map's features.
      t.references :species, foreign_key: { to_table: :plant_species, on_delete: :nullify }
      t.references :variety, foreign_key: { to_table: :plant_varieties, on_delete: :nullify }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.date :observed_on, null: false
      # established (repris) | struggling (en difficulté) | dead (mort)
      t.string :survival, null: false
      t.integer :vigor
      t.text :note
      t.timestamps
    end
    add_index :plant_observations, %i[map_feature_id observed_on]
  end
end
