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

ActiveRecord::Schema[8.1].define(version: 2026_10_04_090000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "citext"
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"
  enable_extension "postgis"

  create_table "applauses", force: :cascade do |t|
    t.bigint "comment_id", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["comment_id", "user_id"], name: "index_applauses_on_comment_id_and_user_id", unique: true
    t.index ["comment_id"], name: "index_applauses_on_comment_id"
    t.index ["user_id"], name: "index_applauses_on_user_id"
  end

  create_table "comment_reads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "commentable_type", null: false
    t.bigint "commentable_id", null: false
    t.datetime "last_read_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "commentable_type", "commentable_id"], name: "index_comment_reads_unique", unique: true
    t.index ["user_id"], name: "index_comment_reads_on_user_id"
  end

  create_table "comment_subscriptions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "commentable_type", null: false
    t.bigint "commentable_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["commentable_type", "commentable_id", "user_id"], name: "index_comment_subscriptions_unique", unique: true
    t.index ["user_id"], name: "index_comment_subscriptions_on_user_id"
  end

  create_table "comments", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "commentable_type", null: false
    t.bigint "commentable_id", null: false
    t.bigint "author_id", null: false
    t.text "body", null: false
    t.bigint "mentioned_user_ids", default: [], null: false, array: true
    t.datetime "edited_at"
    t.datetime "deleted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "index_comments_on_author_id"
    t.index ["commentable_type", "commentable_id", "created_at"], name: "index_comments_on_thread"
    t.index ["map_id", "created_at"], name: "index_comments_on_map_id_and_created_at"
    t.index ["map_id"], name: "index_comments_on_map_id"
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
    t.datetime "expires_at"
    t.datetime "last_sent_at"
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

  create_table "map_publications", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "token", null: false
    t.string "title", null: false
    t.text "description"
    t.datetime "published_at", null: false
    t.datetime "unpublished_at"
    t.integer "version", default: 1, null: false
    t.jsonb "options", default: {}, null: false
    t.jsonb "snapshot", default: {}, null: false
    t.bigint "published_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_id"], name: "index_map_publications_on_map_id", unique: true
    t.index ["published_by_id"], name: "index_map_publications_on_published_by_id"
    t.index ["token"], name: "index_map_publications_on_token", unique: true
  end

  create_table "map_share_links", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "role", default: "viewer", null: false
    t.string "token", null: false
    t.datetime "disabled_at"
    t.bigint "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_map_share_links_on_created_by_id"
    t.index ["map_id"], name: "index_map_share_links_on_map_id", unique: true
    t.index ["token"], name: "index_map_share_links_on_token", unique: true
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
    t.text "description"
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

  create_table "service_requests", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "user_id", null: false
    t.string "kind", null: false
    t.string "status", default: "new", null: false
    t.jsonb "payload", default: {}, null: false
    t.jsonb "snapshot", default: {}, null: false
    t.boolean "contact_consent", default: false, null: false
    t.datetime "consented_at"
    t.bigint "handled_by_id"
    t.text "admin_notes"
    t.datetime "contacted_at"
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["handled_by_id"], name: "index_service_requests_on_handled_by_id"
    t.index ["kind"], name: "index_service_requests_on_kind"
    t.index ["map_id"], name: "index_service_requests_on_map_id"
    t.index ["status", "created_at"], name: "index_service_requests_on_status_and_created_at"
    t.index ["user_id"], name: "index_service_requests_on_user_id"
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
    t.boolean "comment_emails", default: true, null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  add_foreign_key "applauses", "comments"
  add_foreign_key "applauses", "users"
  add_foreign_key "comment_reads", "users"
  add_foreign_key "comment_subscriptions", "users"
  add_foreign_key "comments", "maps"
  add_foreign_key "comments", "users", column: "author_id"
  add_foreign_key "map_features", "maps"
  add_foreign_key "map_features", "users", column: "created_by_id"
  add_foreign_key "map_features", "users", column: "updated_by_id"
  add_foreign_key "map_invitations", "maps"
  add_foreign_key "map_invitations", "users", column: "invited_by_id"
  add_foreign_key "map_memberships", "maps"
  add_foreign_key "map_memberships", "users"
  add_foreign_key "map_memberships", "users", column: "invited_by_id"
  add_foreign_key "map_publications", "maps"
  add_foreign_key "map_publications", "users", column: "published_by_id"
  add_foreign_key "map_share_links", "maps"
  add_foreign_key "map_share_links", "users", column: "created_by_id"
  add_foreign_key "maps", "organizations"
  add_foreign_key "maps", "regions"
  add_foreign_key "maps", "users", column: "owner_id"
  add_foreign_key "organization_memberships", "organizations"
  add_foreign_key "organization_memberships", "users"
  add_foreign_key "region_layers", "regions"
  add_foreign_key "service_requests", "maps"
  add_foreign_key "service_requests", "users"
  add_foreign_key "service_requests", "users", column: "handled_by_id", on_delete: :nullify
  add_foreign_key "sessions", "users"
end
