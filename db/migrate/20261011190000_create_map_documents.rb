class CreateMapDocuments < ActiveRecord::Migration[8.1]
  def change
    create_table :map_documents do |t|
      t.references :map, null: false, foreign_key: true
      t.references :uploaded_by, foreign_key: { to_table: :users, on_delete: :nullify }
      # Sent through the project sheet's private link (no account).
      t.references :project_sheet_link, foreign_key: { on_delete: :nullify }
      t.string :title, null: false, limit: 200
      t.text :description
      t.string :tags, array: true, null: false, default: []
      # « library »: added in the Documents view; « project_sheet »: added
      # with the project sheet (by the team or the people behind the project).
      t.string :origin, null: false, default: "library"
      t.timestamps
    end
    add_index :map_documents, :tags, using: :gin
    add_index :map_documents, [ :map_id, :created_at ]
  end
end
