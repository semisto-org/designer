module Mcp
  module Tools
    # Renames, describes or retags a document of the library, for instance
    # to file it under the tags the team already uses, and rewrites the text
    # of a Markdown document (the same page the team edits in Terranova).
    # Any other file is never changed, and nothing is deleted from here.
    class UpdateDocument < Base
      include DocumentHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          document_id: { type: "integer", minimum: 1, description: :document_id },
          title: { type: "string", minLength: 1, maxLength: 200, description: :document_title },
          content: { type: "string", maxLength: AddDocument::MAX_CHARS, description: :document_new_content },
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
        content = changes.delete(:content)
        raise ToolError, t("errors.document_not_markdown") if content && !document.markdown?
        document.assign_attributes(changes.slice(:title, :description, :tags))
        save_document!(document)
        document.replace_markdown!(content, by: user) if content
        document_json(document).merge(url: documents_url(map))
      end

      private
        def summarize_arguments(arguments)
          return arguments unless arguments.key?(:content)
          arguments.except(:content).merge(content_chars: arguments[:content].to_s.size)
        end

        def summarize_result(data) = { document_id: data[:id] }
    end
  end
end
