# Internal notes on a map's project sheet, one per section: what the team (a
# team map) or the professional (a pro's own map) writes for themselves, never
# shown to the people behind the project, viewers or public pages. Kept out of
# `maps.project` on purpose, so nothing that serialises the sheet can carry
# them by accident.
class CreateProjectSheetNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :project_sheet_notes do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :section, null: false
      t.text :body, null: false
      t.references :updated_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :project_sheet_notes, %i[map_id section], unique: true
  end
end
