module Mcp
  module Tools
    # The map's « Documents » library: plans, reports, soil analyses,
    # permits, old photos… gathered by the team or sent with the project
    # sheet. get_document reads one.
    class ListDocuments < Base
      include DocumentHelpers

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          tag: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :document_tag },
          kind: { type: "string", enum: MapDocument::KINDS.keys + %w[other], description: :document_kind }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, tag: nil, kind: nil)
        map = find_map!(map_id)
        scope = map.documents.newest_first.includes(:uploaded_by, file_attachment: :blob)
        scope = scope.tagged(tag) if tag
        documents = scope.to_a
        documents = documents.select { _1.kind == kind } if kind
        blockers = write_blockers(map)
        {
          documents: documents.map { document_json(_1) },
          count: documents.size,
          tags: map.documents.tag_counts,
          url: documents_url(map),
          can: { add_and_edit: blockers.empty?, blocked_by: blockers.map { |b| t("permissions.#{b}") }.presence }.compact
        }
      end

      private
        def summarize_result(data) = { documents: data[:count] }
    end
  end
end
