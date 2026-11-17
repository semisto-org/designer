module Mcp
  module Tools
    # Renames a tag of the library on every document that carries it, as the
    # pencil beside a shelf's name does on the Documents page: « analyse »
    # becomes « Analyses de sol ». When the new name is already used, the two
    # shelves merge. Only tags change: no file, title or text.
    class RenameDocumentTag < Base
      include DocumentHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          from: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :tag_from },
          to: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :tag_to }
        },
        required: %w[map_id from to]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, from:, to:)
        map = find_map!(map_id)
        require_write!(map)
        raise ToolError, t("errors.tag_blank") if MapDocument.normalize_tag(to).blank?
        renamed = map.all_documents.rename_tag!(from, to)
        { renamed:, tags: map.documents.tag_counts, url: documents_url(map) }
      rescue ActiveRecord::RecordInvalid => e
        raise ToolError, t("errors.document_invalid", details: e.record.errors.full_messages.to_sentence)
      end

      private
        def summarize_result(data) = { renamed: data[:renamed] }
    end
  end
end
