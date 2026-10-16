class AddPartSizeToMcpUploads < ActiveRecord::Migration[8.1]
  def change
    # A large file is sent in parts of this many bytes (one PUT each), then
    # put back together on attach; null for a file sent in one PUT.
    add_column :mcp_uploads, :part_size, :bigint
  end
end
