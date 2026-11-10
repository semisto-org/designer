# Sections inside a column of the team board (« Tableau de l'équipe »):
# a team splits a phase into its own groups, such as « Pré-design » and
# « Design détaillé » in « Design ». A project sits in at most one section
# of its column; deleting a section leaves its projects loose in the column.
class CreateBoardSections < ActiveRecord::Migration[8.1]
  def change
    create_table :board_sections do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :phase, null: false
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :board_sections, %i[organization_id phase position]

    add_reference :maps, :board_section, foreign_key: { on_delete: :nullify }
  end
end
