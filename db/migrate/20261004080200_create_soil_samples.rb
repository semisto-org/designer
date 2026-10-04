class CreateSoilSamples < ActiveRecord::Migration[8.1]
  def change
    # A sampling point: planned on the map, taken in the field, then analysed
    # by a lab (results typed in `results`, the lab report PDF attached).
    create_table :soil_samples do |t|
      t.references :map, null: false, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :label, null: false
      t.st_point :location, srid: 4326
      t.integer :depth_from_cm, null: false, default: 0
      t.integer :depth_to_cm, null: false, default: 20
      # planned | sampled
      t.string :status, null: false, default: "planned"
      # human | suggested (accepted from the suggestions of the panel)
      t.string :source, null: false, default: "human"
      t.date :sampled_on
      t.string :lab
      t.string :lab_reference
      # ph_water, ph_kcl, organic_matter_pct, c_n_ratio, p_mg_100g, k_mg_100g,
      # mg_mg_100g, ca_mg_100g, sand_pct, silt_pct, clay_pct, cec_meq_100g
      t.jsonb :results, null: false, default: {}
      t.text :notes
      t.timestamps
    end
    add_index :soil_samples, :location, using: :gist
    add_index :soil_samples, [ :map_id, :label ]

    # A bio-indicator plant seen on the terrain, and how abundant it was.
    # `catalog_key` points into the curated list (config/soil/bioindicators.yml);
    # `plant_species_id` into the plant catalogue when it exists (no foreign
    # key: that table is built by another feature area).
    create_table :bioindicator_observations do |t|
      t.references :map, null: false, foreign_key: true
      t.references :observed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :species_name, null: false
      t.string :latin_name
      t.string :catalog_key
      t.bigint :plant_species_id
      t.st_point :location, srid: 4326
      t.date :observed_on
      # rare | present | frequent | dominant
      t.string :abundance, null: false, default: "present"
      t.text :notes
      t.timestamps
    end
    add_index :bioindicator_observations, :location, using: :gist
    add_index :bioindicator_observations, [ :map_id, :catalog_key ]
  end
end
