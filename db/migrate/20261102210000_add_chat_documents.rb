# A document joined to a message of the map's discussion stays out of the
# library (`in_library: false`) until someone adds it there in one click.
class AddChatDocuments < ActiveRecord::Migration[8.1]
  def change
    add_column :map_documents, :in_library, :boolean, default: true, null: false
    add_reference :comments, :map_document, foreign_key: { on_delete: :nullify }
  end
end
