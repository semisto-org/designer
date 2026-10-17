# The live edits of a Markdown document while people write it together:
# Yjs updates, relayed by MapDocumentChannel and kept so that whoever joins
# rebuilds the same text. Compacted into one row now and then; cleared when
# the file is replaced from elsewhere (the MCP), which starts a new epoch.
class CreateMapDocumentCollabUpdates < ActiveRecord::Migration[8.1]
  def change
    create_table :map_document_collab_updates do |t|
      t.references :map_document, null: false, foreign_key: { on_delete: :cascade }
      t.integer :epoch, null: false, default: 0
      t.binary :data, null: false
      t.datetime :created_at, null: false
    end
    add_column :map_documents, :collab_epoch, :integer, null: false, default: 0
  end
end
