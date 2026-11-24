# A public link to one photo, video or document (« Lien public »): whoever
# holds it sees that file alone, without an account. Null until an editor
# makes one; cleared to cut it.
class AddShareTokensToPhotosAndDocuments < ActiveRecord::Migration[8.1]
  def change
    add_column :map_photos, :share_token, :string
    add_index :map_photos, :share_token, unique: true
    add_column :map_documents, :share_token, :string
    add_index :map_documents, :share_token, unique: true
  end
end
