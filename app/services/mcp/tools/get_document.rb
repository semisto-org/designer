module Mcp
  module Tools
    # One document of the library and what it says: the text of a PDF, of a
    # word-processor or plain-text file (in pages of MAX_CHARS characters),
    # or the image itself. Other files say why they cannot be read here.
    class GetDocument < Base
      include DocumentHelpers

      MAX_CHARS = 40_000

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          document_id: { type: "integer", minimum: 1, description: :document_id },
          offset: { type: "integer", minimum: 0, default: 0, description: :offset }
        },
        required: %w[map_id document_id]
      )
      hints

      def perform(map_id:, document_id:, offset: 0)
        map = find_map!(map_id)
        document = find_document!(map, document_id)
        read = DocumentReader.new(document).call
        data = document_json(document).merge(url: documents_url(map), format: read.format)
        case read.format
        when "image"
          @image = read.image
          data
        when "text"
          text = read.text
          slice = text[offset, MAX_CHARS].to_s
          after = offset + slice.size
          data.merge(
            pages: read.pages, total_chars: text.size, offset:, text: slice,
            next_offset: after < text.size ? after : nil
          ).compact
        else
          data.merge(reason: t("document_unreadable.#{read.reason}"))
        end
      end

      private
        def content_for(data)
          return super unless @image
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        def summarize_result(data) = { document_id: data[:id], format: data[:format] }
    end
  end
end
