# Turns a word-processor document of a map's library into a PDF (OfficePdf),
# asked from the library or through the MCP server. The PDF is a new document
# beside the source, with its title, note and tags, and remembers where it
# came from (`converted_from`); the source reads « Conversion en PDF… »
# until then (`pdf_conversion`). One conversion at a time for the whole app:
# LibreOffice needs about 200 Mo while it works, and the app has 2 Go.
class ConvertMapDocumentToPdfJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(*) { "office_pdf" }, duration: 10.minutes
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  def perform(document, user = nil)
    return unless document.pdf_conversion == "pending" && document.file.attached?
    converter = OfficePdf.new
    # The temporary file keeps the extension, which LibreOffice reads.
    document.file.blob.open(tmpdir: Dir.tmpdir) do |file|
      output = converter.convert(file.path)
      next finish(document, "failed") unless output
      copy = build_copy(document, output, user)
      if copy.save
        finish(document, nil)
      else
        finish(document, copy.errors.of_kind?(:base, :storage_full) ? "storage_full" : "failed")
      end
    end
  rescue ActiveStorage::FileNotFoundError
    finish(document, "failed")
  ensure
    converter&.cleanup
  end

  private
    def finish(document, state) = document.update_columns(pdf_conversion: state, updated_at: Time.current)

    def build_copy(document, output, user)
      copy = document.map.all_documents.new(
        title: document.title, description: document.description, tags: document.tags,
        origin: document.in_library? ? "library" : "chat", in_library: document.in_library?,
        uploaded_by: user || document.uploaded_by, converted_from: document
      )
      copy.file.attach(io: File.open(output), filename: "#{document.file.filename.base}.pdf", content_type: "application/pdf")
      copy
    end
end
