# Answers an AI proposes for the project sheet (MCP propose_project_sheet):
# one pending value per field, with its rationale, until a human accepts or
# refuses it on the sheet.
class CreateProjectSheetDrafts < ActiveRecord::Migration[8.1]
  def change
    create_table :project_sheet_drafts do |t|
      t.references :map, null: false, index: false, foreign_key: { on_delete: :cascade }
      t.string :section, null: false
      t.string :field, null: false
      t.jsonb :value, null: false
      t.text :rationale, null: false
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :client_name
      t.timestamps
    end
    add_index :project_sheet_drafts, %i[map_id section field], unique: true
  end
end
