module Mcp
  module Tools
    # Turns a word-processor document of the library (.docx, .doc, .odt,
    # .rtf) into a PDF beside it, like « Convertir en PDF » on the Documents
    # page: the person can then read it in the browser and on the phone,
    # print it or send it. The conversion runs in the background, a few
    # seconds; get_document on the source then gives pdf_document_id.
    class ConvertDocumentToPdf < Base
      include DocumentHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          document_id: { type: "integer", minimum: 1, description: :document_id }
        },
        required: %w[map_id document_id]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, document_id:)
        map = find_map!(map_id)
        require_write!(map)
        document = find_document!(map, document_id, discussion: true)
        raise ToolError, t("errors.document_not_convertible") unless document.convertible_to_pdf?
        started = document.request_pdf!(by: user)
        document_json(document.reload).merge(status: started ? "converting" : "already_converting", url: documents_url(map))
      end

      private
        def summarize_result(data) = { document_id: data[:id], status: data[:status] }
    end
  end
end
