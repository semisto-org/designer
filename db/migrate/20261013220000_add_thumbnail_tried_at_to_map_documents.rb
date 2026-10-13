class AddThumbnailTriedAtToMapDocuments < ActiveRecord::Migration[8.1]
  def change
    # When the server tried to draw a PDF's first page (MapDocumentThumbnailJob),
    # so a PDF it cannot read is not tried again and again.
    add_column :map_documents, :thumbnail_tried_at, :datetime
  end
end
