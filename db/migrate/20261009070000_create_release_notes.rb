# « Nouveautés »: what changed in the Designer, written by Semisto staff for
# the people who use it, each with an optional screenshot; people give a
# thumbs up to the ones they like. `key` names the entries shipped by the
# seeds (db/seeds/60_release_notes.rb) so a deploy never adds them twice.
class CreateReleaseNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :release_notes do |t|
      t.string :key
      t.string :title, null: false
      t.text :body, null: false
      t.date :published_on, null: false
      t.datetime :published_at
      t.string :link_path
      t.string :link_label
      t.string :screenshot_alt
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :release_notes, :key, unique: true, where: "key IS NOT NULL"
    add_index :release_notes, %i[published_at published_on]

    create_table :release_note_likes do |t|
      t.references :release_note, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end
    add_index :release_note_likes, %i[release_note_id user_id], unique: true

    add_column :users, :release_notes_seen_at, :datetime
  end
end
