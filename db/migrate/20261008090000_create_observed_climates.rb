# The climate observed over 30 years at one ERA5-Land grid cell (0.1°,
# ~9 km), computed once from the Copernicus Climate Data Store and shared by
# every map in that cell. Only the cell's centre is stored, never a map's
# exact location.
class CreateObservedClimates < ActiveRecord::Migration[8.1]
  def change
    create_table :observed_climates do |t|
      t.decimal :cell_lat, precision: 4, scale: 1, null: false
      t.decimal :cell_lng, precision: 4, scale: 1, null: false
      t.integer :first_year, null: false
      t.integer :last_year, null: false
      t.string :status, null: false, default: "pending"
      t.string :job_id
      t.integer :attempts, null: false, default: 0
      t.jsonb :indicators, null: false, default: {}
      t.string :error
      t.datetime :submitted_at
      t.datetime :computed_at
      t.timestamps
    end
    add_index :observed_climates, %i[cell_lat cell_lng first_year last_year], unique: true, name: "index_observed_climates_on_cell_and_period"
  end
end
