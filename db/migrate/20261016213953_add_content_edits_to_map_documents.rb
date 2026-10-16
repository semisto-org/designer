# Who last changed the text of a Markdown document in the editor, and when
# (the reader shows « Modifié par … il y a … »).
class AddContentEditsToMapDocuments < ActiveRecord::Migration[8.1]
  def change
    add_reference :map_documents, :content_edited_by, foreign_key: { to_table: :users, on_delete: :nullify }
    add_column :map_documents, :content_edited_at, :datetime
  end
end
