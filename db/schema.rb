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

ActiveRecord::Schema[8.1].define(version: 2026_10_10_200000) do
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

  create_table "admin_events", force: :cascade do |t|
    t.bigint "admin_id"
    t.bigint "target_user_id"
    t.string "action", null: false
    t.jsonb "details", default: {}, null: false
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.index ["admin_id"], name: "index_admin_events_on_admin_id"
    t.index ["created_at"], name: "index_admin_events_on_created_at"
    t.index ["target_user_id"], name: "index_admin_events_on_target_user_id"
  end

  create_table "aerial_views", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "name", null: false
    t.date "captured_on", null: false
    t.string "kind", null: false
    t.string "url", limit: 2048, null: false
    t.string "attribution"
    t.integer "min_zoom"
    t.integer "max_zoom"
    t.bigint "plan_purchase_id"
    t.bigint "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_aerial_views_on_created_by_id"
    t.index ["map_id", "captured_on"], name: "index_aerial_views_on_map_id_and_captured_on"
    t.index ["plan_purchase_id"], name: "index_aerial_views_on_plan_purchase_id"
  end

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

  create_table "applauses", force: :cascade do |t|
    t.bigint "comment_id", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["comment_id", "user_id"], name: "index_applauses_on_comment_id_and_user_id", unique: true
    t.index ["comment_id"], name: "index_applauses_on_comment_id"
    t.index ["user_id"], name: "index_applauses_on_user_id"
  end

  create_table "billing_accounts", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "stripe_customer_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stripe_customer_id"], name: "index_billing_accounts_on_stripe_customer_id", unique: true
    t.index ["user_id"], name: "index_billing_accounts_on_user_id", unique: true
  end

  create_table "billing_notices", force: :cascade do |t|
    t.bigint "plan_purchase_id"
    t.string "kind", null: false
    t.datetime "sent_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "plan_grant_id"
    t.index ["plan_grant_id", "kind"], name: "index_billing_notices_on_plan_grant_id_and_kind", unique: true
    t.index ["plan_grant_id"], name: "index_billing_notices_on_plan_grant_id"
    t.index ["plan_purchase_id", "kind"], name: "index_billing_notices_on_plan_purchase_id_and_kind", unique: true
    t.index ["plan_purchase_id"], name: "index_billing_notices_on_plan_purchase_id"
  end

  create_table "billing_payments", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "plan_purchase_id"
    t.bigint "plan_subscription_id"
    t.string "plan_key", null: false
    t.integer "amount_cents", null: false
    t.integer "tax_cents", default: 0, null: false
    t.integer "discount_cents", default: 0, null: false
    t.string "currency", default: "eur", null: false
    t.string "promotion_code"
    t.datetime "paid_at", null: false
    t.integer "refunded_cents", default: 0, null: false
    t.datetime "refunded_at"
    t.boolean "livemode", default: true, null: false
    t.string "stripe_checkout_session_id"
    t.string "stripe_invoice_id"
    t.string "stripe_payment_intent_id"
    t.string "stripe_charge_id"
    t.string "stripe_customer_id"
    t.text "hosted_invoice_url"
    t.text "invoice_pdf_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "invoice_request_id"
    t.index ["invoice_request_id"], name: "index_billing_payments_on_invoice_request_id"
    t.index ["paid_at"], name: "index_billing_payments_on_paid_at"
    t.index ["plan_purchase_id"], name: "index_billing_payments_on_plan_purchase_id"
    t.index ["plan_subscription_id"], name: "index_billing_payments_on_plan_subscription_id"
    t.index ["promotion_code"], name: "index_billing_payments_on_promotion_code"
    t.index ["stripe_checkout_session_id"], name: "index_billing_payments_on_stripe_checkout_session_id", unique: true
    t.index ["stripe_invoice_id"], name: "index_billing_payments_on_stripe_invoice_id", unique: true
    t.index ["stripe_payment_intent_id"], name: "index_billing_payments_on_stripe_payment_intent_id"
    t.index ["user_id"], name: "index_billing_payments_on_user_id"
  end

  create_table "bioindicator_observations", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "observed_by_id"
    t.string "species_name", null: false
    t.string "latin_name"
    t.string "catalog_key"
    t.bigint "plant_species_id"
    t.geometry "location", limit: {:srid=>4326, :type=>"st_point"}
    t.date "observed_on"
    t.string "abundance", default: "present", null: false
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["location"], name: "index_bioindicator_observations_on_location", using: :gist
    t.index ["map_id", "catalog_key"], name: "index_bioindicator_observations_on_map_id_and_catalog_key"
    t.index ["map_id"], name: "index_bioindicator_observations_on_map_id"
    t.index ["observed_by_id"], name: "index_bioindicator_observations_on_observed_by_id"
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

  create_table "financial_plans", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.jsonb "inputs", default: {}, null: false
    t.integer "schema_version", default: 1, null: false
    t.integer "lock_version", default: 0, null: false
    t.bigint "updated_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_id"], name: "index_financial_plans_on_map_id", unique: true
    t.index ["updated_by_id"], name: "index_financial_plans_on_updated_by_id"
  end

  create_table "import_records", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "source", null: false
    t.string "external_type", null: false
    t.string "external_id", null: false
    t.string "record_type"
    t.bigint "record_id"
    t.string "digest"
    t.datetime "imported_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_id", "source", "external_type", "external_id"], name: "index_import_records_on_upstream", unique: true
    t.index ["record_type", "record_id"], name: "index_import_records_on_record"
  end

  create_table "invoice_requests", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "organization_name", null: false
    t.text "billing_address", null: false
    t.string "company_number"
    t.string "billing_email", null: false
    t.string "purchase_order"
    t.string "plan_key", null: false
    t.integer "duration_months", default: 12, null: false
    t.integer "amount_cents", null: false
    t.string "currency", default: "eur", null: false
    t.text "message"
    t.string "status", default: "requested", null: false
    t.string "stripe_invoice_id"
    t.string "stripe_invoice_number"
    t.text "hosted_invoice_url"
    t.text "invoice_pdf_url"
    t.datetime "invoiced_at"
    t.datetime "paid_at"
    t.datetime "cancelled_at"
    t.bigint "handled_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "stripe_customer_id"
    t.index ["handled_by_id"], name: "index_invoice_requests_on_handled_by_id"
    t.index ["status", "created_at"], name: "index_invoice_requests_on_status_and_created_at"
    t.index ["stripe_customer_id"], name: "index_invoice_requests_on_stripe_customer_id"
    t.index ["stripe_invoice_id"], name: "index_invoice_requests_on_stripe_invoice_id", unique: true
    t.index ["user_id"], name: "index_invoice_requests_on_user_id"
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
    t.string "tags", default: [], null: false, array: true
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

  create_table "map_photos", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "uploaded_by_id"
    t.bigint "photo_album_id"
    t.bigint "map_feature_id"
    t.datetime "taken_at"
    t.geometry "location", limit: {:srid=>4326, :type=>"st_point"}
    t.string "location_source"
    t.float "heading"
    t.string "caption", limit: 500
    t.string "source", default: "web", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "sketches_count", default: 0, null: false
    t.index "((location)::geography)", name: "index_map_photos_on_location_geography", using: :gist
    t.index ["location"], name: "index_map_photos_on_location", using: :gist
    t.index ["map_feature_id"], name: "index_map_photos_on_map_feature_id"
    t.index ["map_id", "checksum"], name: "index_map_photos_on_map_id_and_checksum", unique: true, where: "(checksum IS NOT NULL)"
    t.index ["map_id", "taken_at"], name: "index_map_photos_on_map_id_and_taken_at"
    t.index ["map_id"], name: "index_map_photos_on_map_id"
    t.index ["photo_album_id"], name: "index_map_photos_on_photo_album_id"
    t.index ["uploaded_by_id"], name: "index_map_photos_on_uploaded_by_id"
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

  create_table "map_terrains", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "status", default: "pending", null: false
    t.string "provider"
    t.string "crs", default: "EPSG:3857", null: false
    t.float "west"
    t.float "north"
    t.float "step"
    t.float "cell_size_m"
    t.integer "cols"
    t.integer "rows"
    t.float "lat0"
    t.float "margin_m"
    t.float "z_min"
    t.float "z_max"
    t.float "z_unit", default: 0.01, null: false
    t.integer "nodata", default: 65535, null: false
    t.integer "nodata_count"
    t.geometry "extent", limit: {:srid=>4326, :type=>"st_polygon"}
    t.jsonb "metadata", default: {}, null: false
    t.integer "progress", default: 0, null: false
    t.datetime "started_at"
    t.datetime "fetched_at"
    t.text "error"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_id"], name: "index_map_terrains_on_map_id", unique: true
  end

  create_table "map_transfers", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "from_user_id", null: false
    t.bigint "to_user_id", null: false
    t.string "status", default: "pending", null: false
    t.datetime "expires_at", null: false
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["from_user_id"], name: "index_map_transfers_on_from_user_id"
    t.index ["map_id"], name: "index_map_transfers_on_map_id"
    t.index ["map_id"], name: "index_map_transfers_one_pending_per_map", unique: true, where: "((status)::text = 'pending'::text)"
    t.index ["to_user_id", "status"], name: "index_map_transfers_on_to_user_id_and_status"
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
    t.jsonb "water_settings", default: {}, null: false
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

  create_table "observed_climates", force: :cascade do |t|
    t.decimal "cell_lat", precision: 4, scale: 1, null: false
    t.decimal "cell_lng", precision: 4, scale: 1, null: false
    t.integer "first_year", null: false
    t.integer "last_year", null: false
    t.string "status", default: "pending", null: false
    t.string "job_id"
    t.integer "attempts", default: 0, null: false
    t.jsonb "indicators", default: {}, null: false
    t.string "error"
    t.datetime "submitted_at"
    t.datetime "computed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["cell_lat", "cell_lng", "first_year", "last_year"], name: "index_observed_climates_on_cell_and_period", unique: true
  end

  create_table "organization_invitations", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.citext "email_address", null: false
    t.string "role", default: "member", null: false
    t.string "token", null: false
    t.bigint "invited_by_id", null: false
    t.datetime "accepted_at"
    t.datetime "expires_at"
    t.datetime "last_sent_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invited_by_id"], name: "index_organization_invitations_on_invited_by_id"
    t.index ["organization_id"], name: "index_organization_invitations_on_organization_id"
    t.index ["token"], name: "index_organization_invitations_on_token", unique: true
  end

  create_table "organization_memberships", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "member", null: false
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
    t.string "status", default: "active", null: false
    t.string "source", default: "human", null: false
    t.text "rationale"
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

  create_table "photo_albums", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "name", null: false
    t.text "description"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["map_id"], name: "index_photo_albums_on_map_id"
  end

  create_table "photo_sketches", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "map_photo_id", null: false
    t.bigint "created_by_id"
    t.string "name", null: false
    t.jsonb "strokes", default: [], null: false
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_photo_sketches_on_created_by_id"
    t.index ["map_id"], name: "index_photo_sketches_on_map_id"
    t.index ["map_photo_id"], name: "index_photo_sketches_on_map_photo_id"
  end

  create_table "plan_grants", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "plan_key", null: false
    t.datetime "starts_at", null: false
    t.datetime "ends_at", null: false
    t.datetime "revoked_at"
    t.text "notes"
    t.bigint "invoice_request_id"
    t.bigint "granted_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["granted_by_id"], name: "index_plan_grants_on_granted_by_id"
    t.index ["invoice_request_id"], name: "index_plan_grants_on_invoice_request_id", unique: true
    t.index ["user_id", "ends_at"], name: "index_plan_grants_on_user_id_and_ends_at"
    t.index ["user_id"], name: "index_plan_grants_on_user_id"
  end

  create_table "plan_images", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "created_by_id"
    t.string "name", null: false
    t.float "center_lng", null: false
    t.float "center_lat", null: false
    t.float "width_m", null: false
    t.float "rotation", default: 0.0, null: false
    t.float "aspect", default: 1.0, null: false
    t.float "opacity", default: 0.7, null: false
    t.boolean "visible", default: true, null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_plan_images_on_created_by_id"
    t.index ["map_id"], name: "index_plan_images_on_map_id"
  end

  create_table "plan_purchases", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "plan_key", null: false
    t.string "status", default: "paid", null: false
    t.datetime "starts_at", null: false
    t.datetime "expires_at"
    t.string "stripe_checkout_session_id", null: false
    t.string "stripe_payment_intent_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stripe_checkout_session_id"], name: "index_plan_purchases_on_stripe_checkout_session_id", unique: true
    t.index ["stripe_payment_intent_id"], name: "index_plan_purchases_on_stripe_payment_intent_id"
    t.index ["user_id", "plan_key", "status", "expires_at"], name: "index_plan_purchases_on_user_plan_status_expiry"
    t.index ["user_id"], name: "index_plan_purchases_on_user_id"
  end

  create_table "plan_subscriptions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "plan_key", null: false
    t.string "status", null: false
    t.string "stripe_subscription_id", null: false
    t.string "stripe_customer_id"
    t.string "stripe_price_id"
    t.datetime "current_period_start"
    t.datetime "current_period_end"
    t.boolean "cancel_at_period_end", default: false, null: false
    t.datetime "canceled_at"
    t.datetime "ended_at"
    t.datetime "past_due_since"
    t.datetime "synced_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stripe_subscription_id"], name: "index_plan_subscriptions_on_stripe_subscription_id", unique: true
    t.index ["user_id"], name: "index_plan_subscriptions_on_user_id"
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

  create_table "project_sheet_drafts", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "section", null: false
    t.string "field", null: false
    t.jsonb "value", null: false
    t.text "rationale", null: false
    t.bigint "created_by_id"
    t.string "client_name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_project_sheet_drafts_on_created_by_id"
    t.index ["map_id", "section", "field"], name: "index_project_sheet_drafts_on_map_id_and_section_and_field", unique: true
  end

  create_table "project_sheet_links", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "token", null: false
    t.bigint "created_by_id"
    t.datetime "disabled_at"
    t.datetime "opened_at"
    t.datetime "submitted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_project_sheet_links_on_created_by_id"
    t.index ["map_id"], name: "index_project_sheet_links_on_map_id", unique: true
    t.index ["token"], name: "index_project_sheet_links_on_token", unique: true
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
    t.geometry "outline", limit: {:srid=>4326, :type=>"multi_polygon"}
    t.bigint "parent_id"
    t.index ["key"], name: "index_regions_on_key", unique: true
    t.index ["outline"], name: "index_regions_on_outline", using: :gist
    t.index ["parent_id"], name: "index_regions_on_parent_id"
  end

  create_table "release_note_likes", force: :cascade do |t|
    t.bigint "release_note_id", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["release_note_id", "user_id"], name: "index_release_note_likes_on_release_note_id_and_user_id", unique: true
    t.index ["release_note_id"], name: "index_release_note_likes_on_release_note_id"
    t.index ["user_id"], name: "index_release_note_likes_on_user_id"
  end

  create_table "release_notes", force: :cascade do |t|
    t.string "key"
    t.string "title", null: false
    t.text "body", null: false
    t.date "published_on", null: false
    t.datetime "published_at"
    t.string "link_path"
    t.string "link_label"
    t.string "screenshot_alt"
    t.bigint "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_release_notes_on_created_by_id"
    t.index ["key"], name: "index_release_notes_on_key", unique: true, where: "(key IS NOT NULL)"
    t.index ["published_at", "published_on"], name: "index_release_notes_on_published_at_and_published_on"
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
    t.bigint "impersonator_id"
    t.index ["impersonator_id"], name: "index_sessions_on_impersonator_id"
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "soil_samples", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.bigint "created_by_id"
    t.string "label", null: false
    t.geometry "location", limit: {:srid=>4326, :type=>"st_point"}
    t.integer "depth_from_cm", default: 0, null: false
    t.integer "depth_to_cm", default: 20, null: false
    t.string "status", default: "planned", null: false
    t.string "source", default: "human", null: false
    t.date "sampled_on"
    t.string "lab"
    t.string "lab_reference"
    t.jsonb "results", default: {}, null: false
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_soil_samples_on_created_by_id"
    t.index ["location"], name: "index_soil_samples_on_location", using: :gist
    t.index ["map_id", "label"], name: "index_soil_samples_on_map_id_and_label"
    t.index ["map_id"], name: "index_soil_samples_on_map_id"
  end

  create_table "stripe_events", force: :cascade do |t|
    t.string "stripe_event_id", null: false
    t.string "event_type", null: false
    t.boolean "livemode", default: true, null: false
    t.jsonb "payload", default: {}, null: false
    t.datetime "processed_at"
    t.integer "attempts", default: 0, null: false
    t.text "error"
    t.string "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_stripe_events_on_created_at"
    t.index ["event_type"], name: "index_stripe_events_on_event_type"
    t.index ["stripe_event_id"], name: "index_stripe_events_on_stripe_event_id", unique: true
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
    t.datetime "ai_trial_started_at"
    t.datetime "ai_trial_reminded_at"
    t.datetime "tour_seen_at"
    t.datetime "release_notes_seen_at"
    t.string "password_digest"
    t.string "sign_in_code_digest"
    t.datetime "sign_in_code_sent_at"
    t.integer "sign_in_code_attempts", default: 0, null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  create_table "water_sources", force: :cascade do |t|
    t.bigint "map_id", null: false
    t.string "name", null: false
    t.boolean "potable", default: false, null: false
    t.text "notes"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "map_id, lower((name)::text)", name: "index_water_sources_on_map_and_name", unique: true
    t.index ["map_id"], name: "index_water_sources_on_map_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "admin_events", "users", column: "admin_id", on_delete: :nullify
  add_foreign_key "admin_events", "users", column: "target_user_id", on_delete: :nullify
  add_foreign_key "aerial_views", "maps"
  add_foreign_key "aerial_views", "plan_purchases", on_delete: :nullify
  add_foreign_key "aerial_views", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "ai_actions", "maps", on_delete: :cascade
  add_foreign_key "ai_actions", "users", on_delete: :cascade
  add_foreign_key "api_tokens", "users", on_delete: :cascade
  add_foreign_key "applauses", "comments"
  add_foreign_key "applauses", "users"
  add_foreign_key "billing_accounts", "users"
  add_foreign_key "billing_notices", "plan_grants"
  add_foreign_key "billing_notices", "plan_purchases"
  add_foreign_key "billing_payments", "invoice_requests"
  add_foreign_key "billing_payments", "plan_purchases"
  add_foreign_key "billing_payments", "plan_subscriptions"
  add_foreign_key "billing_payments", "users"
  add_foreign_key "bioindicator_observations", "maps"
  add_foreign_key "bioindicator_observations", "users", column: "observed_by_id", on_delete: :nullify
  add_foreign_key "comment_reads", "users"
  add_foreign_key "comment_subscriptions", "users"
  add_foreign_key "comments", "maps"
  add_foreign_key "comments", "users", column: "author_id"
  add_foreign_key "financial_plans", "maps"
  add_foreign_key "financial_plans", "users", column: "updated_by_id"
  add_foreign_key "import_records", "maps", on_delete: :cascade
  add_foreign_key "invoice_requests", "users"
  add_foreign_key "invoice_requests", "users", column: "handled_by_id", on_delete: :nullify
  add_foreign_key "map_features", "maps"
  add_foreign_key "map_features", "users", column: "created_by_id"
  add_foreign_key "map_features", "users", column: "updated_by_id"
  add_foreign_key "map_invitations", "maps"
  add_foreign_key "map_invitations", "users", column: "invited_by_id"
  add_foreign_key "map_memberships", "maps"
  add_foreign_key "map_memberships", "users"
  add_foreign_key "map_memberships", "users", column: "invited_by_id"
  add_foreign_key "map_photos", "map_features", on_delete: :nullify
  add_foreign_key "map_photos", "maps"
  add_foreign_key "map_photos", "photo_albums", on_delete: :nullify
  add_foreign_key "map_photos", "users", column: "uploaded_by_id", on_delete: :nullify
  add_foreign_key "map_publications", "maps"
  add_foreign_key "map_publications", "users", column: "published_by_id"
  add_foreign_key "map_share_links", "maps"
  add_foreign_key "map_share_links", "users", column: "created_by_id"
  add_foreign_key "map_terrains", "maps"
  add_foreign_key "map_transfers", "maps", on_delete: :cascade
  add_foreign_key "map_transfers", "users", column: "from_user_id", on_delete: :cascade
  add_foreign_key "map_transfers", "users", column: "to_user_id", on_delete: :cascade
  add_foreign_key "maps", "organizations"
  add_foreign_key "maps", "regions"
  add_foreign_key "maps", "users", column: "owner_id"
  add_foreign_key "oauth_access_tokens", "oauth_clients", on_delete: :cascade
  add_foreign_key "oauth_access_tokens", "oauth_grants", on_delete: :nullify
  add_foreign_key "oauth_access_tokens", "users", on_delete: :cascade
  add_foreign_key "oauth_grants", "oauth_clients", on_delete: :cascade
  add_foreign_key "oauth_grants", "users", on_delete: :cascade
  add_foreign_key "organization_invitations", "organizations"
  add_foreign_key "organization_invitations", "users", column: "invited_by_id"
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
  add_foreign_key "photo_albums", "maps"
  add_foreign_key "photo_sketches", "map_photos", on_delete: :cascade
  add_foreign_key "photo_sketches", "maps", on_delete: :cascade
  add_foreign_key "photo_sketches", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "plan_grants", "invoice_requests"
  add_foreign_key "plan_grants", "users"
  add_foreign_key "plan_grants", "users", column: "granted_by_id", on_delete: :nullify
  add_foreign_key "plan_images", "maps"
  add_foreign_key "plan_images", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "plan_purchases", "users"
  add_foreign_key "plan_subscriptions", "users"
  add_foreign_key "plant_observations", "map_features", on_delete: :cascade
  add_foreign_key "plant_observations", "maps", on_delete: :cascade
  add_foreign_key "plant_observations", "plant_species", column: "species_id", on_delete: :nullify
  add_foreign_key "plant_observations", "plant_varieties", column: "variety_id", on_delete: :nullify
  add_foreign_key "plant_observations", "users", on_delete: :nullify
  add_foreign_key "plant_species", "plant_genera", column: "genus_id"
  add_foreign_key "plant_varieties", "plant_species", column: "species_id", on_delete: :cascade
  add_foreign_key "project_sheet_drafts", "maps", on_delete: :cascade
  add_foreign_key "project_sheet_drafts", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "project_sheet_links", "maps", on_delete: :cascade
  add_foreign_key "project_sheet_links", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "region_layers", "regions"
  add_foreign_key "regions", "regions", column: "parent_id"
  add_foreign_key "release_note_likes", "release_notes", on_delete: :cascade
  add_foreign_key "release_note_likes", "users", on_delete: :cascade
  add_foreign_key "release_notes", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "service_requests", "maps"
  add_foreign_key "service_requests", "users"
  add_foreign_key "service_requests", "users", column: "handled_by_id", on_delete: :nullify
  add_foreign_key "sessions", "users"
  add_foreign_key "sessions", "users", column: "impersonator_id", on_delete: :cascade
  add_foreign_key "soil_samples", "maps"
  add_foreign_key "soil_samples", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "water_sources", "maps"
end
