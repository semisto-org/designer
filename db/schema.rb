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

ActiveRecord::Schema[8.1].define(version: 2026_10_04_050200) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "citext"
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"
  enable_extension "postgis"

  create_table "ai_actions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "map_id"
    t.string "tool", null: false
    t.string "status", default: "ok", null: false
    t.jsonb "arguments", default: {}, null: false
    t.jsonb "result", default: {}, null: false
    t.string "error_message"
    t.string "client_name"
    t.string "credential_type"
    t.datetime "created_at", null: false
    t.index ["map_id", "created_at"], name: "index_ai_actions_on_map_id_and_created_at"
    t.index ["map_id"], name: "index_ai_actions_on_map_id"
    t.index ["user_id", "created_at"], name: "index_ai_actions_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_ai_actions_on_user_id"
  end

  create_table "api_tokens", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "token_digest", null: false
    t.string "token_hint", null: false
    t.string "scopes", default: "maps:read", null: false
    t.datetime "last_used_at"
    t.datetime "expires_at"
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["token_digest"], name: "index_api_tokens_on_token_digest", unique: true
    t.index ["user_id"], name: "index_api_tokens_on_user_id"
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

  create_table "oauth_access_tokens", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "oauth_client_id", null: false
    t.bigint "oauth_grant_id"
    t.string "token_digest", null: false
    t.string "refresh_token_digest"
    t.string "scopes", null: false
    t.string "resource"
    t.datetime "expires_at", null: false
    t.datetime "refresh_expires_at"
    t.datetime "revoked_at"
    t.datetime "last_used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["oauth_client_id"], name: "index_oauth_access_tokens_on_oauth_client_id"
    t.index ["oauth_grant_id"], name: "index_oauth_access_tokens_on_oauth_grant_id"
    t.index ["refresh_token_digest"], name: "index_oauth_access_tokens_on_refresh_token_digest", unique: true
    t.index ["token_digest"], name: "index_oauth_access_tokens_on_token_digest", unique: true
    t.index ["user_id", "oauth_client_id"], name: "index_oauth_access_tokens_on_user_id_and_oauth_client_id"
    t.index ["user_id"], name: "index_oauth_access_tokens_on_user_id"
  end

  create_table "oauth_clients", force: :cascade do |t|
    t.string "client_id", null: false
    t.string "client_secret_digest"
    t.string "name", null: false
    t.jsonb "redirect_uris", default: [], null: false
    t.string "token_endpoint_auth_method", default: "none", null: false
    t.jsonb "grant_types", default: ["authorization_code", "refresh_token"], null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["client_id"], name: "index_oauth_clients_on_client_id", unique: true
  end

  create_table "oauth_grants", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "oauth_client_id", null: false
    t.string "code_digest", null: false
    t.string "redirect_uri", null: false
    t.string "code_challenge", null: false
    t.string "code_challenge_method", default: "S256", null: false
    t.string "scopes", null: false
    t.string "resource"
    t.datetime "expires_at", null: false
    t.datetime "used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code_digest"], name: "index_oauth_grants_on_code_digest", unique: true
    t.index ["oauth_client_id"], name: "index_oauth_grants_on_oauth_client_id"
    t.index ["user_id"], name: "index_oauth_grants_on_user_id"
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

  add_foreign_key "ai_actions", "maps", on_delete: :cascade
  add_foreign_key "ai_actions", "users", on_delete: :cascade
  add_foreign_key "api_tokens", "users", on_delete: :cascade
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
  add_foreign_key "oauth_access_tokens", "oauth_clients", on_delete: :cascade
  add_foreign_key "oauth_access_tokens", "oauth_grants", on_delete: :nullify
  add_foreign_key "oauth_access_tokens", "users", on_delete: :cascade
  add_foreign_key "oauth_grants", "oauth_clients", on_delete: :cascade
  add_foreign_key "oauth_grants", "users", on_delete: :cascade
  add_foreign_key "organization_memberships", "organizations"
  add_foreign_key "organization_memberships", "users"
  add_foreign_key "region_layers", "regions"
  add_foreign_key "sessions", "users"
end
