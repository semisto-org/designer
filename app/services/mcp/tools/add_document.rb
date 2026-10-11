module Mcp
  module Tools
    # Writes a document of the AI's own into the map's library: a site
    # report, a summary of an interview, a planting schedule as CSV, a
    # GeoJSON export… The team finds it under « Documents », with its tags.
    class AddDocument < Base
      include DocumentHelpers

      MAX_CHARS = 200_000
      FORMATS = {
        "md" => "text/markdown", "txt" => "text/plain", "csv" => "text/csv", "geojson" => "application/geo+json"
      }.freeze

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          title: { type: "string", minLength: 1, maxLength: 200, description: :document_title },
          content: { type: "string", minLength: 1, maxLength: MAX_CHARS, description: :document_content },
          format: { type: "string", enum: FORMATS.keys, default: "md", description: :document_format },
          description: { type: "string", maxLength: 2000, description: :document_description },
          tags: {
            type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :document_tags,
            items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
          }
        },
        required: %w[map_id title content]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, title:, content:, format: "md", description: nil, tags: [])
        map = find_map!(map_id)
        require_write!(map)
        document = map.documents.new(title:, description:, tags:, origin: "library", uploaded_by: user)
        document.file.attach(
          io: StringIO.new(content), filename: "#{title.parameterize.presence || 'document'}.#{format}",
          content_type: FORMATS.fetch(format), identify: false
        )
        save_document!(document)
        map.touch
        document_json(document).merge(url: documents_url(map), next_step: t("notes.document_added"))
      end

      private
        def summarize_arguments(arguments)
          arguments.except(:content).merge(content_chars: arguments[:content].to_s.size)
            .transform_values { |v| v.is_a?(String) ? v.first(200) : v }
        end

        def summarize_result(data) = { document_id: data[:id] }
    end
  end
end
