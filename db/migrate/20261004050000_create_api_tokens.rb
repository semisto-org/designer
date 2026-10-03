class CreateApiTokens < ActiveRecord::Migration[8.1]
  def change
    # Personal access tokens for MCP clients that cannot run the OAuth flow
    # (scripts, self-hosted agents). Only a SHA-256 digest is stored: the
    # token is shown once, at creation.
    create_table :api_tokens do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.string :token_digest, null: false
      # First characters of the token, to recognise it in the list.
      t.string :token_hint, null: false
      # Space-separated: maps:read [maps:drafts]
      t.string :scopes, null: false, default: "maps:read"
      t.datetime :last_used_at
      t.datetime :expires_at
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :api_tokens, :token_digest, unique: true
  end
end
