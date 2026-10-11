module Mcp
  module Tools
    # Renames, describes or retags a document of the library, for instance
    # to file it under the tags the team already uses. The file itself is
    # never changed, and nothing is deleted from here.
    class UpdateDocument < Base
      include DocumentHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          document_id: { type: "integer", minimum: 1, description: :document_id },
          title: { type: "string", minLength: 1, maxLength: 200, description: :document_title },
          description: { type: [ "string", "null" ], maxLength: 2000, description: :document_description },
          tags: {
            type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :tags_change,
            items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
          }
        },
        required: %w[map_id document_id],
        minProperties: 3
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, document_id:, **changes)
        map = find_map!(map_id)
        require_write!(map)
        document = find_document!(map, document_id)
        document.assign_attributes(changes.slice(:title, :description, :tags))
        save_document!(document)
        document_json(document).merge(url: documents_url(map))
      end

      private
        def summarize_result(data) = { document_id: data[:id] }
    end
  end
end
