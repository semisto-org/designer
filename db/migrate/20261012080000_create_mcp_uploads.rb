class CreateMcpUploads < ActiveRecord::Migration[8.1]
  def change
    # A file an AI sends straight to storage (create_upload, then an HTTP PUT)
    # before attaching it to a map (attach_photos, attach_documents).
    create_table :mcp_uploads do |t|
      t.references :blob, null: false, foreign_key: { to_table: :active_storage_blobs, on_delete: :cascade }, index: { unique: true }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :kind, null: false
      t.datetime :attached_at
      t.timestamps
    end
    add_index :mcp_uploads, :created_at, where: "attached_at IS NULL", name: "index_mcp_uploads_unattached"
  end
end
