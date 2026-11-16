# When each person last used Terranova (web, phone app, MCP or API), shown to
# the admins of their teams. Filled from what was already known: the last
# sign-in, the browser sessions and the tokens' last use.
class AddLastActiveAtToUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :last_active_at, :datetime
    execute <<~SQL
      UPDATE users SET last_active_at = known.at
      FROM (
        SELECT user_id, MAX(at) AS at FROM (
          SELECT id AS user_id, last_signed_in_at AS at FROM users
          UNION ALL SELECT user_id, updated_at FROM sessions WHERE impersonator_id IS NULL
          UNION ALL SELECT user_id, last_used_at FROM oauth_access_tokens
          UNION ALL SELECT user_id, last_used_at FROM api_tokens
        ) seen WHERE at IS NOT NULL GROUP BY user_id
      ) known
      WHERE known.user_id = users.id
    SQL
  end

  def down
    remove_column :users, :last_active_at
  end
end
