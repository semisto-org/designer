# A large video sent from the « Photos » panel travels in parts like a drone
# view (McpUpload, kind "web_photo"): what the person typed with it waits in
# `photo_params` until the parts are put together, then the photo it became
# (or why it could not) is read back by the browser.
class AddPhotoFieldsToMcpUploads < ActiveRecord::Migration[8.1]
  def change
    add_column :mcp_uploads, :photo_params, :jsonb
    add_reference :mcp_uploads, :map_photo, foreign_key: { on_delete: :nullify }, index: false
    add_column :mcp_uploads, :failure, :string
  end
end
