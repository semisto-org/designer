# Draws the first-page thumbnail of every PDF of a map's library on the
# server. The browser draws one at upload (pdf.js), shown in the meantime,
# but a PDF an AI sent through the MCP server (attach_documents,
# import_from_url) arrives without one, and the browser's could miss the
# photos (JPEG 2000 images, before pdf.js got its decoders): Ghostscript's
# replaces it.
#
# Called once per new PDF, and by the recurring backfill
# (`MapDocumentThumbnailJob.backfill`). `thumbnail_tried_at` records the
# attempt, so each PDF is drawn once; when Ghostscript cannot read it, the
# browser's thumbnail, if any, stays.
class MapDocumentThumbnailJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  BACKFILL_BATCH = 20

  def self.pending
    MapDocument.where(thumbnail_tried_at: nil)
      .joins(file_attachment: :blob).where(active_storage_blobs: { content_type: "application/pdf" })
  end

  # Runs in the recurring task itself, one PDF after the other, so a slow
  # batch never piles the same documents up in the queue.
  def self.backfill(limit: BACKFILL_BATCH)
    pending.order(:id).limit(limit).each { |document| perform_now(document) }
  end

  def perform(document)
    return unless document.preview == "pdf" && document.thumbnail_tried_at.nil?
    output = nil
    document.file.blob.open(tmpdir: Dir.tmpdir) do |file|
      output = PdfThumbnail.new.render(file.path)
    end
    document.thumbnail.attach(io: File.open(output), filename: "apercu.jpg", content_type: "image/jpeg") if output
  rescue ActiveStorage::FileNotFoundError
    nil
  ensure
    # Written without callbacks or validations: an old document that no
    # longer passes them still records its attempt.
    document.update_columns(thumbnail_tried_at: Time.current) if document&.persisted?
    File.delete(output) if output && File.exist?(output)
  end
end
