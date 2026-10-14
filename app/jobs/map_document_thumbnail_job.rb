# Gives a PDF of a map's library its first-page thumbnail when nobody drew
# one: the browser does it at upload (pdf.js), but a PDF that an AI sent
# through the MCP server (attach_documents, import_from_url), or that came
# before the browser did it, arrives without one.
#
# Called once per new PDF without a thumbnail, and by the recurring
# backfill (`MapDocumentThumbnailJob.backfill`). `thumbnail_tried_at`
# records the attempt, so a PDF Ghostscript cannot read is tried once.
class MapDocumentThumbnailJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  BACKFILL_BATCH = 20

  def self.pending
    MapDocument.where(thumbnail_tried_at: nil)
      .joins(file_attachment: :blob).where(active_storage_blobs: { content_type: "application/pdf" })
      .where.missing(:thumbnail_attachment)
  end

  # Runs in the recurring task itself, one PDF after the other, so a slow
  # batch never piles the same documents up in the queue.
  def self.backfill(limit: BACKFILL_BATCH)
    pending.order(:id).limit(limit).each { |document| perform_now(document) }
  end

  def perform(document)
    return unless document.preview == "pdf" && !document.thumbnail.attached? && document.thumbnail_tried_at.nil?
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
