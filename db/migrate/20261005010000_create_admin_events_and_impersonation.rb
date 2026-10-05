# Super admin: the log of what Semisto staff do from the admin screens, and
# impersonation (« Se connecter en tant que ») as a session that remembers
# which admin opened it.
class CreateAdminEventsAndImpersonation < ActiveRecord::Migration[8.1]
  def change
    create_table :admin_events do |t|
      t.references :admin, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :target_user, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :action, null: false
      t.jsonb :details, default: {}, null: false
      t.string :ip_address
      t.string :user_agent
      t.datetime :created_at, null: false
    end
    add_index :admin_events, :created_at

    add_reference :sessions, :impersonator, foreign_key: { to_table: :users, on_delete: :cascade }
  end
end
