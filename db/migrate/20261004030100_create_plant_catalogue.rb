# The plant catalogue ("Planto" in Terranova): genera, species, varieties,
# their common names, and the provenance of every value, field by field.
#
# Units are those of a map: metres and degrees Celsius. Hardiness is stored
# normalised (USDA zone 1..13 and absolute minimum temperature), never as the
# heterogeneous text the source catalogue carries. Multi-valued facets are
# PostgreSQL arrays of canonical keys (see PlantVocabulary), months are 1..12.
class CreatePlantCatalogue < ActiveRecord::Migration[8.1]
  def change
    create_table :plant_genera do |t|
      t.string :latin_name, null: false
      t.string :common_name
      t.integer :terranova_id
      t.timestamps
    end
    add_index :plant_genera, "lower(latin_name)", unique: true, name: "index_plant_genera_on_lower_latin_name"
    add_index :plant_genera, :terranova_id, unique: true

    create_table :plant_species do |t|
      t.string :latin_name, null: false
      t.references :genus, foreign_key: { to_table: :plant_genera }
      # Habit and life
      t.string :plant_type
      t.string :strata
      t.string :foliage_type
      t.string :life_cycle
      t.string :growth_rate
      t.string :root_system
      t.string :fertility
      # Size at maturity (metres)
      t.decimal :height_min_m, precision: 6, scale: 2
      t.decimal :height_max_m, precision: 6, scale: 2
      t.decimal :spread_min_m, precision: 6, scale: 2
      t.decimal :spread_max_m, precision: 6, scale: 2
      # Hardiness, normalised
      t.integer :hardiness_zone
      t.decimal :min_temperature_c, precision: 4, scale: 1
      # Site
      t.string :exposures, array: true, null: false, default: []
      t.string :soil_moisture, array: true, null: false, default: []
      t.string :soil_types, array: true, null: false, default: []
      t.string :soil_ph, array: true, null: false, default: []
      t.string :soil_richness
      t.integer :watering_need
      # Uses and ecosystem
      t.integer :edible_rating
      t.integer :medicinal_rating
      t.string :edible_parts, array: true, null: false, default: []
      t.string :eco_services, array: true, null: false, default: []
      # Calendar (months 1..12)
      t.integer :flowering_months, array: true, null: false, default: []
      t.integer :fruiting_months, array: true, null: false, default: []
      t.integer :harvest_months, array: true, null: false, default: []
      t.integer :pruning_months, array: true, null: false, default: []
      # Territory (ISO 3166-1 alpha-2 country codes), cautions
      t.string :native_countries, array: true, null: false, default: []
      t.string :invasive_countries, array: true, null: false, default: []
      t.string :toxic_for, array: true, null: false, default: []
      # Growth model inputs (years)
      t.integer :maturity_years
      t.integer :production_start_year
      t.integer :terranova_id
      t.timestamps
    end
    add_index :plant_species, "lower(latin_name)", unique: true, name: "index_plant_species_on_lower_latin_name"
    add_index :plant_species, :terranova_id, unique: true
    add_index :plant_species, :strata
    add_index :plant_species, :plant_type
    add_index :plant_species, :hardiness_zone
    add_index :plant_species, :eco_services, using: :gin
    add_index :plant_species, :exposures, using: :gin

    create_table :plant_varieties do |t|
      t.references :species, null: false, foreign_key: { to_table: :plant_species, on_delete: :cascade }
      # Cultivar name, as written by nurseries (« Reinette d'Orléans »).
      t.string :name, null: false
      t.string :fertility
      t.integer :taste_rating
      t.string :productivity
      # Free harvest season (« fin septembre »), not the growth-model field.
      t.string :ripening
      t.string :disease_resistance
      t.integer :maturity_years
      t.integer :production_start_year
      t.integer :terranova_id
      t.timestamps
    end
    add_index :plant_varieties, :terranova_id, unique: true

    create_table :plant_common_names do |t|
      t.references :nameable, polymorphic: true, null: false
      t.string :language, null: false, default: "fr"
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :plant_common_names, "nameable_type, nameable_id, language, lower(name)",
              unique: true, name: "index_plant_common_names_uniqueness"

    # Where each value comes from: one row per (record, field). A value from
    # PFAF says so; a value copied by an import stays « to_verify » until a
    # human checks it against its source.
    create_table :plant_field_sources do |t|
      t.references :record, polymorphic: true, null: false, index: false
      t.string :field, null: false
      t.string :source, null: false
      t.string :upstream_source
      t.string :license
      t.string :url
      # sourced | to_verify | empty
      t.string :status, null: false, default: "to_verify"
      t.timestamps
    end
    add_index :plant_field_sources, %i[record_type record_id field], unique: true, name: "index_plant_field_sources_uniqueness"
    add_index :plant_field_sources, :source
  end
end
