module Mcp
  module Tools
    # Deletes documents of the library, as « Supprimer » does on the
    # Documents page: only when the person asked for it. Cannot be undone.
    class DeleteDocuments < Base
      MAX_DOCUMENTS = 50

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          document_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: MAX_DOCUMENTS,
            uniqueItems: true, description: :document_ids
          }
        },
        required: %w[map_id document_ids]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(map_id:, document_ids:)
        map = find_map!(map_id)
        require_write!(map)
        documents = map.documents.where(id: document_ids).to_a
        documents.each(&:destroy!)
        deleted = documents.map(&:id)
        { deleted:, not_found: document_ids - deleted, documents_left: map.documents.count }
      end

      private
        def summarize_result(data) = { deleted: data[:deleted].size, document_ids: data[:deleted] }
    end
  end
end
