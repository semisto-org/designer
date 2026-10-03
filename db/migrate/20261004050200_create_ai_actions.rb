class CreateAiActions < ActiveRecord::Migration[8.1]
  def change
    # Journal of every action an AI took through the MCP server: who, on
    # which map, with which tool and client, what it read or proposed.
    create_table :ai_actions do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, foreign_key: { on_delete: :cascade }
      t.string :tool, null: false
      # ok | error
      t.string :status, null: false, default: "ok"
      t.jsonb :arguments, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.string :error_message
      t.string :client_name
      # oauth | token
      t.string :credential_type
      t.datetime :created_at, null: false
    end
    add_index :ai_actions, [ :map_id, :created_at ]
    add_index :ai_actions, [ :user_id, :created_at ]
  end
end
