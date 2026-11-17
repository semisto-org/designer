# « Collègue IA »: an agent member of a team (TeamAgent), granted by Semisto
# from the admin, switched on map by map, woken by a mention or a task
# (AgentRun). The team brings its own API key, stored encrypted.
class CreateTeamAgents < ActiveRecord::Migration[8.1]
  def change
    change_table :organizations, bulk: true do |t|
      t.datetime :agents_module_granted_at
      t.string :agent_provider, null: false, default: "anthropic"
      t.text :agent_api_key
      t.string :agent_api_key_hint
      # Monthly ceiling, in cents of the provider's currency (US dollars).
      t.integer :agent_monthly_budget_cents, null: false, default: 2000
    end

    create_table :team_agents do |t|
      t.references :organization, null: false, foreign_key: true, index: { unique: true }
      t.string :name, null: false
      t.text :instructions
      t.boolean :active, null: false, default: true
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end

    change_table :maps, bulk: true do |t|
      t.datetime :agent_enabled_at
      t.references :agent_enabled_by, foreign_key: { to_table: :users, on_delete: :nullify }, index: false
    end

    create_table :agent_runs do |t|
      t.references :team_agent, null: false, foreign_key: { on_delete: :cascade }
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :requested_by, null: false, foreign_key: { to_table: :users, on_delete: :cascade }
      t.string :source_type, null: false
      t.bigint :source_id, null: false
      t.string :status, null: false, default: "queued"
      t.string :model
      t.integer :turns, null: false, default: 0
      t.integer :tool_calls, null: false, default: 0
      t.jsonb :tools_used, null: false, default: []
      t.bigint :input_tokens, null: false, default: 0
      t.bigint :output_tokens, null: false, default: 0
      t.bigint :cache_read_tokens, null: false, default: 0
      t.bigint :cache_write_tokens, null: false, default: 0
      # Millionths of a US dollar.
      t.bigint :cost_micros, null: false, default: 0
      t.bigint :reply_comment_id
      t.string :error
      t.datetime :started_at
      t.datetime :finished_at
      t.timestamps
      t.index %i[source_type source_id]
      t.index %i[organization_id created_at]
      # One wake per message, whatever is retried.
      t.index %i[team_agent_id source_id], unique: true, where: "source_type = 'Comment'", name: "index_agent_runs_once_per_comment"
    end

    change_table :comments, bulk: true do |t|
      # Written by the team's colleague, at the request of `author`.
      t.references :agent, foreign_key: { to_table: :team_agents, on_delete: :nullify }
      t.bigint :mentioned_agent_ids, array: true, null: false, default: []
    end

    add_reference :tasks, :agent, foreign_key: { to_table: :team_agents, on_delete: :nullify }
  end
end
