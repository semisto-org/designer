# Compresses a large PDF of a map's library once it is uploaded, and keeps
# the compressed file instead of the original when it is clearly smaller
# (see PdfCompressor). The document reads « Compression en cours… » until
# then; its original size stays known (`original_byte_size`).
class CompressMapDocumentJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  def perform(document)
    return unless document.compression == "pending" && document.file.attached?
    blob = document.file.blob
    output = nil
    blob.open(tmpdir: Dir.tmpdir) do |file|
      output = PdfCompressor.new.compress(file.path)
      if output
        document.file.attach(io: File.open(output), filename: blob.filename.to_s, content_type: "application/pdf")
        document.update!(compression: "compressed", original_byte_size: blob.byte_size)
      else
        document.update!(compression: "unchanged")
      end
    end
  rescue ActiveStorage::FileNotFoundError
    document.update!(compression: "unchanged")
  ensure
    File.delete(output) if output && File.exist?(output)
  end
end
