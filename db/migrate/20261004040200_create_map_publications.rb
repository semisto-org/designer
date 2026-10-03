# A public, read-only, account-free view of a map: a snapshot taken when the
# owner publishes, served at /p/:token until unpublished.
class CreateMapPublications < ActiveRecord::Migration[8.1]
  def change
    create_table :map_publications do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      t.string :token, null: false
      t.string :title, null: false
      t.text :description
      t.datetime :published_at, null: false
      t.datetime :unpublished_at
      t.integer :version, null: false, default: 1
      t.jsonb :options, null: false, default: {}
      t.jsonb :snapshot, null: false, default: {}
      t.references :published_by, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :map_publications, :token, unique: true
  end
end
