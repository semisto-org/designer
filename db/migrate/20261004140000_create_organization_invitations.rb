# Invitations to join a team, by e-mail: same life cycle as map invitations
# (token, 30-day expiry renewed on resend, single use).
class CreateOrganizationInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_invitations do |t|
      t.references :organization, null: false, foreign_key: true
      t.citext :email_address, null: false
      t.string :role, null: false, default: "member"
      t.string :token, null: false
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.datetime :accepted_at
      t.datetime :expires_at
      t.datetime :last_sent_at
      t.timestamps
    end
    add_index :organization_invitations, :token, unique: true
  end
end
