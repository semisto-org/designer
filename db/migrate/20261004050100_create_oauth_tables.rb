class CreateOauthTables < ActiveRecord::Migration[8.1]
  def change
    # OAuth 2.1 authorization server for remote MCP connectors (claude.ai,
    # Claude Desktop, Claude Code…). Clients register themselves (RFC 7591).
    create_table :oauth_clients do |t|
      t.string :client_id, null: false
      t.string :client_secret_digest
      t.string :name, null: false
      t.jsonb :redirect_uris, null: false, default: []
      # none | client_secret_post | client_secret_basic
      t.string :token_endpoint_auth_method, null: false, default: "none"
      t.jsonb :grant_types, null: false, default: [ "authorization_code", "refresh_token" ]
      # Non-personal registration metadata (client_uri, software_id…).
      t.jsonb :metadata, null: false, default: {}
      t.timestamps
    end
    add_index :oauth_clients, :client_id, unique: true

    # Authorization codes (single use, a few minutes, PKCE S256).
    create_table :oauth_grants do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :oauth_client, null: false, foreign_key: { on_delete: :cascade }
      t.string :code_digest, null: false
      t.string :redirect_uri, null: false
      t.string :code_challenge, null: false
      t.string :code_challenge_method, null: false, default: "S256"
      t.string :scopes, null: false
      t.string :resource
      t.datetime :expires_at, null: false
      t.datetime :used_at
      t.timestamps
    end
    add_index :oauth_grants, :code_digest, unique: true

    # Access tokens (short-lived) with their rotating refresh token.
    create_table :oauth_access_tokens do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :oauth_client, null: false, foreign_key: { on_delete: :cascade }
      t.references :oauth_grant, foreign_key: { on_delete: :nullify }
      t.string :token_digest, null: false
      t.string :refresh_token_digest
      t.string :scopes, null: false
      t.string :resource
      t.datetime :expires_at, null: false
      t.datetime :refresh_expires_at
      t.datetime :revoked_at
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :oauth_access_tokens, :token_digest, unique: true
    add_index :oauth_access_tokens, :refresh_token_digest, unique: true
    add_index :oauth_access_tokens, [ :user_id, :oauth_client_id ]
  end
end
