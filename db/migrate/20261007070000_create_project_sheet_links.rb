# The private link a map's editors send to the people behind the project, so
# they can fill in the project sheet themselves without an account and
# without seeing the map. One per map; it can be switched off or reset.
class CreateProjectSheetLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :project_sheet_links do |t|
      t.references :map, null: false, index: { unique: true }, foreign_key: { on_delete: :cascade }
      t.string :token, null: false, index: { unique: true }
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :disabled_at
      t.datetime :opened_at
      t.datetime :submitted_at
      t.timestamps
    end
  end
end
