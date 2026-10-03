class CreateMaps < ActiveRecord::Migration[8.1]
  def change
    create_table :maps do |t|
      t.string :name, null: false
      t.text :description
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.references :organization, foreign_key: true
      t.references :region, null: false, foreign_key: true
      t.string :address
      t.jsonb :parcels, null: false, default: []
      t.st_multi_polygon :boundary, srid: 4326
      t.st_point :center, srid: 4326
      t.integer :zoom
      t.float :area_m2
      # Project sheet answers (who, ambitions, uses, budget, time, skills…)
      t.jsonb :project, null: false, default: {}
      # Journey: observe → map → design → plant
      t.string :stage, null: false, default: "observe"
      t.datetime :archived_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :maps, :boundary, using: :gist

    create_table :map_memberships do |t|
      t.references :map, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      # owner | editor | viewer
      t.string :role, null: false, default: "viewer"
      t.references :invited_by, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :map_memberships, [ :map_id, :user_id ], unique: true

    create_table :map_invitations do |t|
      t.references :map, null: false, foreign_key: true
      t.citext :email_address, null: false
      t.string :role, null: false, default: "viewer"
      t.string :token, null: false
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.datetime :accepted_at
      t.timestamps
    end
    add_index :map_invitations, :token, unique: true
  end
end
