class CreateOrganizations < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.timestamps
    end
    add_index :organizations, :slug, unique: true

    create_table :organization_memberships do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      # admin | designer | intern
      t.string :role, null: false, default: "designer"
      t.timestamps
    end
    add_index :organization_memberships, [ :organization_id, :user_id ], unique: true
  end
end
