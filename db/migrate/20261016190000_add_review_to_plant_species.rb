# A species a person adds from a map's palette waits for a catalogue reviewer
# (« proposed »): only its author and the maps that use it see it until it is
# accepted (« reviewed ») or kept off the shared catalogue (« rejected »).
class AddReviewToPlantSpecies < ActiveRecord::Migration[8.1]
  def change
    change_table :plant_species, bulk: true do |t|
      t.string :review_status, null: false, default: "reviewed"
      t.references :proposed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :proposed_map, foreign_key: { to_table: :maps, on_delete: :nullify }
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at
      t.integer :gbif_key
      t.string :family
    end
    add_index :plant_species, :review_status

    add_column :users, :catalogue_reviewer, :boolean, null: false, default: false
  end
end
