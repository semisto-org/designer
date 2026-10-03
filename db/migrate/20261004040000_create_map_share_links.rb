# One role-bound invitation link per map. The owner can disable it, change
# the role it grants, or reset it (new token: old copies stop working).
class CreateMapShareLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :map_share_links do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      t.string :role, null: false, default: "viewer"
      t.string :token, null: false
      t.datetime :disabled_at
      t.references :created_by, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :map_share_links, :token, unique: true

    add_column :map_invitations, :expires_at, :datetime
    add_column :map_invitations, :last_sent_at, :datetime
  end
end
