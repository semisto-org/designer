module Mcp
  module Tools
    # Turns files sent with create_upload into documents of the map's
    # library, of any kind the library takes (PDF, images, Word, sheets,
    # slides, plans…), each with its title, description and tags.
    class AttachDocuments < Base
      include DocumentHelpers
      include UploadHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          documents: {
            type: "array", minItems: 1, maxItems: UploadHelpers::MAX_ATTACH, description: :attach_document_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[signed_id title],
              properties: {
                signed_id: { type: "string", minLength: 10, maxLength: 1000, description: :signed_id },
                title: { type: "string", minLength: 1, maxLength: 200, description: :document_title },
                description: { type: "string", maxLength: 2000, description: :document_description },
                tags: {
                  type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :document_tags,
                  items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
                }
              }
            }
          }
        },
        required: %w[map_id documents]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, documents:)
        map = find_map!(map_id)
        require_write!(map)
        attached, rejected = each_line(documents) do |line|
          upload = claim_upload!(map, line["signed_id"])
          document = attacher(map).document(upload.blob, line)
          upload.update!(attached_at: Time.current)
          document
        end
        map.touch
        { attached: attached.map { document_json(_1) }, rejected:, url: documents_url(map), next_step: t("notes.document_added") }
      end

      private
        def summarize_arguments(arguments) = { map_id: arguments[:map_id], documents: Array(arguments[:documents]).size }
        def summarize_result(data) = { attached: data[:attached].size, rejected: data[:rejected].size }
    end
  end
end
