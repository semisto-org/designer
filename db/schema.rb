# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_04_030500) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "citext"
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"
  enable_extension "postgis"
  enable_extension "unaccent"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "map_features", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "layer", default: "existing", null: false
    t.string "kind", null: false
    t.string "name"
    t.text "notes"
    t.geometry "geometry", limit: {:srid=>4326, :type=>"geometry"}, null: false
    t.jsonb "properties", default: {}, null: false
    t.jsonb "style", default: {}, null: false
    t.string "status", default: "active", null: false
    t.string "source", default: "human", null: false
    t.text "rationale"
    t.bigint "created_by_id"
    t.bigint "updated_by_id"
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_map_features_on_created_by_id"
    t.index ["geometry"], name: "index_map_features_on_geometry", using: :gist
    t.index ["map_id", "layer"], name: "index_map_features_on_map_id_and_layer"
    t.index ["map_id", "status"], name: "index_map_features_on_map_id_and_status"
    t.index ["map_id"], name: "index_map_features_on_map_id"
    t.index ["updated_by_id"], name: "index_map_features_on_updated_by_id"
  end

  create_table "map_invitations", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.citext "email_address", null: false
    t.string "role", default: "viewer", null: false
    t.string "token", null: false
    t.bigint "invited_by_id", null: false
    t.datetime "accepted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invited_by_id"], name: "index_map_invitations_on_invited_by_id"
    t.index ["map_id"], name: "index_map_invitations_on_map_id"
    t.index ["token"], name: "index_map_invitations_on_token", unique: true
  end

  create_table "map_memberships", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "viewer", null: false
    t.bigint "invited_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invited_by_id"], name: "index_map_memberships_on_invited_by_id"
    t.index ["map_id", "user_id"], name: "index_map_memberships_on_map_id_and_user_id", unique: true
    t.index ["map_id"], name: "index_map_memberships_on_map_id"
    t.index ["user_id"], name: "index_map_memberships_on_user_id"
  end

  create_table "maps", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.bigint "owner_id", null: false
    t.bigint "organization_id"
    t.bigint "region_id", null: false
    t.string "address"
    t.jsonb "parcels", default: [], null: false
    t.geometry "boundary", limit: {:srid=>4326, :type=>"multi_polygon"}
    t.geometry "center", limit: {:srid=>4326, :type=>"st_point"}
    t.integer "zoom"
    t.float "area_m2"
    t.jsonb "project", default: {}, null: false
    t.string "stage", default: "observe", null: false
    t.datetime "archived_at"
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["boundary"], name: "index_maps_on_boundary", using: :gist
    t.index ["organization_id"], name: "index_maps_on_organization_id"
    t.index ["owner_id"], name: "index_maps_on_owner_id"
    t.index ["region_id"], name: "index_maps_on_region_id"
  end

  create_table "organization_memberships", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "designer", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "user_id"], name: "index_organization_memberships_on_organization_id_and_user_id", unique: true
    t.index ["organization_id"], name: "index_organization_memberships_on_organization_id"
    t.index ["user_id"], name: "index_organization_memberships_on_user_id"
  end

  create_table "organizations", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_organizations_on_slug", unique: true
  end

  create_table "palette_items", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "species_id", null: false
    t.bigint "variety_id"
    t.string "strata"
    t.string "role"
    t.text "notes"
    t.integer "target_count"
    t.integer "position", default: 0, null: false
    t.bigint "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_palette_items_on_created_by_id"
    t.index ["map_id", "species_id"], name: "index_palette_items_unique_species", unique: true, where: "(variety_id IS NULL)"
    t.index ["map_id", "variety_id"], name: "index_palette_items_unique_variety", unique: true, where: "(variety_id IS NOT NULL)"
    t.index ["map_id"], name: "index_palette_items_on_map_id"
    t.index ["species_id"], name: "index_palette_items_on_species_id"
    t.index ["variety_id"], name: "index_palette_items_on_variety_id"
  end

  create_table "patch_items", force: :cascade do |t|
    t.bigint "map_feature_id", null: false
    t.bigint "map_id", null: false
    t.bigint "species_id", null: false
    t.bigint "variety_id"
    t.string "strata"
    t.decimal "density", precision: 8, scale: 3
    t.integer "count"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_feature_id", "species_id"], name: "index_patch_items_unique_species", unique: true, where: "(variety_id IS NULL)"
    t.index ["map_feature_id", "variety_id"], name: "index_patch_items_unique_variety", unique: true, where: "(variety_id IS NOT NULL)"
    t.index ["map_feature_id"], name: "index_patch_items_on_map_feature_id"
    t.index ["map_id"], name: "index_patch_items_on_map_id"
    t.index ["species_id"], name: "index_patch_items_on_species_id"
    t.index ["variety_id"], name: "index_patch_items_on_variety_id"
  end

  create_table "plant_common_names", force: :cascade do |t|
    t.string "nameable_type", null: false
    t.bigint "nameable_id", null: false
    t.string "language", default: "fr", null: false
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "nameable_type, nameable_id, language, lower((name)::text)", name: "index_plant_common_names_uniqueness", unique: true
    t.index ["nameable_type", "nameable_id"], name: "index_plant_common_names_on_nameable"
  end

  create_table "plant_field_sources", force: :cascade do |t|
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.string "field", null: false
    t.string "source", null: false
    t.string "upstream_source"
    t.string "license"
    t.string "url"
    t.string "status", default: "to_verify", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["record_type", "record_id", "field"], name: "index_plant_field_sources_uniqueness", unique: true
    t.index ["source"], name: "index_plant_field_sources_on_source"
  end

  create_table "plant_genera", force: :cascade do |t|
    t.string "latin_name", null: false
    t.string "common_name"
    t.integer "terranova_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((latin_name)::text)", name: "index_plant_genera_on_lower_latin_name", unique: true
    t.index ["terranova_id"], name: "index_plant_genera_on_terranova_id", unique: true
  end

  create_table "plant_observations", force: :cascade do |t|
    t.bigint "map_feature_id", null: false
    t.bigint "map_id", null: false
    t.bigint "species_id"
    t.bigint "variety_id"
    t.bigint "user_id"
    t.date "observed_on", null: false
    t.string "survival", null: false
    t.integer "vigor"
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_feature_id", "observed_on"], name: "index_plant_observations_on_map_feature_id_and_observed_on"
    t.index ["map_feature_id"], name: "index_plant_observations_on_map_feature_id"
    t.index ["map_id"], name: "index_plant_observations_on_map_id"
    t.index ["species_id"], name: "index_plant_observations_on_species_id"
    t.index ["user_id"], name: "index_plant_observations_on_user_id"
    t.index ["variety_id"], name: "index_plant_observations_on_variety_id"
  end

  create_table "plant_species", force: :cascade do |t|
    t.string "latin_name", null: false
    t.bigint "genus_id"
    t.string "plant_type"
    t.string "strata"
    t.string "foliage_type"
    t.string "life_cycle"
    t.string "growth_rate"
    t.string "root_system"
    t.string "fertility"
    t.decimal "height_min_m", precision: 6, scale: 2
    t.decimal "height_max_m", precision: 6, scale: 2
    t.decimal "spread_min_m", precision: 6, scale: 2
    t.decimal "spread_max_m", precision: 6, scale: 2
    t.integer "hardiness_zone"
    t.decimal "min_temperature_c", precision: 4, scale: 1
    t.string "exposures", default: [], null: false, array: true
    t.string "soil_moisture", default: [], null: false, array: true
    t.string "soil_types", default: [], null: false, array: true
    t.string "soil_ph", default: [], null: false, array: true
    t.string "soil_richness"
    t.integer "watering_need"
    t.integer "edible_rating"
    t.integer "medicinal_rating"
    t.string "edible_parts", default: [], null: false, array: true
    t.string "eco_services", default: [], null: false, array: true
    t.integer "flowering_months", default: [], null: false, array: true
    t.integer "fruiting_months", default: [], null: false, array: true
    t.integer "harvest_months", default: [], null: false, array: true
    t.integer "pruning_months", default: [], null: false, array: true
    t.string "native_countries", default: [], null: false, array: true
    t.string "invasive_countries", default: [], null: false, array: true
    t.string "toxic_for", default: [], null: false, array: true
    t.integer "maturity_years"
    t.integer "production_start_year"
    t.integer "terranova_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((latin_name)::text)", name: "index_plant_species_on_lower_latin_name", unique: true
    t.index ["eco_services"], name: "index_plant_species_on_eco_services", using: :gin
    t.index ["exposures"], name: "index_plant_species_on_exposures", using: :gin
    t.index ["genus_id"], name: "index_plant_species_on_genus_id"
    t.index ["hardiness_zone"], name: "index_plant_species_on_hardiness_zone"
    t.index ["plant_type"], name: "index_plant_species_on_plant_type"
    t.index ["strata"], name: "index_plant_species_on_strata"
    t.index ["terranova_id"], name: "index_plant_species_on_terranova_id", unique: true
  end

  create_table "plant_varieties", force: :cascade do |t|
    t.bigint "species_id", null: false
    t.string "name", null: false
    t.string "fertility"
    t.integer "taste_rating"
    t.string "productivity"
    t.string "ripening"
    t.string "disease_resistance"
    t.integer "maturity_years"
    t.integer "production_start_year"
    t.integer "terranova_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["species_id"], name: "index_plant_varieties_on_species_id"
    t.index ["terranova_id"], name: "index_plant_varieties_on_terranova_id", unique: true
  end

  create_table "region_layers", force: :cascade do |t|
    t.bigint "region_id", null: false
    t.string "key", null: false
    t.string "name", null: false
    t.string "group_name"
    t.string "category", default: "overlay", null: false
    t.string "kind", default: "wms", null: false
    t.string "url", null: false
    t.string "layers"
    t.string "identify_url"
    t.string "legend_url"
    t.string "attribution"
    t.float "opacity", default: 0.7, null: false
    t.integer "min_zoom"
    t.integer "max_zoom"
    t.integer "position", default: 0, null: false
    t.boolean "enabled", default: true, null: false
    t.boolean "proxied", default: true, null: false
    t.jsonb "options", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["region_id", "key"], name: "index_region_layers_on_region_id_and_key", unique: true
    t.index ["region_id"], name: "index_region_layers_on_region_id"
  end

  create_table "regions", force: :cascade do |t|
    t.string "key", null: false
    t.string "name", null: false
    t.string "country_code", null: false
    t.string "locale", default: "fr", null: false
    t.boolean "active", default: true, null: false
    t.geometry "bounds", limit: {:srid=>4326, :type=>"st_polygon"}
    t.geometry "center", limit: {:srid=>4326, :type=>"st_point"}
    t.integer "default_zoom", default: 8, null: false
    t.jsonb "settings", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_regions_on_key", unique: true
  end

  create_table "sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.citext "email_address", null: false
    t.string "name"
    t.string "avatar_url"
    t.string "google_uid"
    t.boolean "admin", default: false, null: false
    t.string "locale", default: "fr", null: false
    t.datetime "last_signed_in_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "map_features", "maps"
  add_foreign_key "map_features", "users", column: "created_by_id"
  add_foreign_key "map_features", "users", column: "updated_by_id"
  add_foreign_key "map_invitations", "maps"
  add_foreign_key "map_invitations", "users", column: "invited_by_id"
  add_foreign_key "map_memberships", "maps"
  add_foreign_key "map_memberships", "users"
  add_foreign_key "map_memberships", "users", column: "invited_by_id"
  add_foreign_key "maps", "organizations"
  add_foreign_key "maps", "regions"
  add_foreign_key "maps", "users", column: "owner_id"
  add_foreign_key "organization_memberships", "organizations"
  add_foreign_key "organization_memberships", "users"
  add_foreign_key "palette_items", "maps", on_delete: :cascade
  add_foreign_key "palette_items", "plant_species", column: "species_id"
  add_foreign_key "palette_items", "plant_varieties", column: "variety_id"
  add_foreign_key "palette_items", "users", column: "created_by_id"
  add_foreign_key "patch_items", "map_features", on_delete: :cascade
  add_foreign_key "patch_items", "maps", on_delete: :cascade
  add_foreign_key "patch_items", "plant_species", column: "species_id"
  add_foreign_key "patch_items", "plant_varieties", column: "variety_id"
  add_foreign_key "plant_observations", "map_features", on_delete: :cascade
  add_foreign_key "plant_observations", "maps", on_delete: :cascade
  add_foreign_key "plant_observations", "plant_species", column: "species_id", on_delete: :nullify
  add_foreign_key "plant_observations", "plant_varieties", column: "variety_id", on_delete: :nullify
  add_foreign_key "plant_observations", "users", on_delete: :nullify
  add_foreign_key "plant_species", "plant_genera", column: "genus_id"
  add_foreign_key "plant_varieties", "plant_species", column: "species_id", on_delete: :cascade
  add_foreign_key "region_layers", "regions"
  add_foreign_key "sessions", "users"
end
