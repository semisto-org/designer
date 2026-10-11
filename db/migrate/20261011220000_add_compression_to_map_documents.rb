class AddCompressionToMapDocuments < ActiveRecord::Migration[8.1]
  def change
    # pending | compressed | unchanged (no gain, or Ghostscript unavailable)
    add_column :map_documents, :compression, :string
    add_column :map_documents, :original_byte_size, :bigint
  end
end
