module Mcp
  module Tools
    # Turns files sent with create_upload into photos of the terrain: dated,
    # placed and turned from their EXIF block, as an upload from the editor,
    # unless the AI says otherwise; filed in an album, linked to an element.
    class AttachPhotos < Base
      include PhotoHelpers
      include UploadHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photos: {
            type: "array", minItems: 1, maxItems: UploadHelpers::MAX_ATTACH, description: :attach_photo_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[signed_id],
              properties: {
                signed_id: { type: "string", minLength: 10, maxLength: 1000, description: :signed_id },
                **PhotoHelpers::PLACE_PROPERTIES
              }
            }
          }
        },
        required: %w[map_id photos]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, photos:)
        map = find_map!(map_id)
        require_write!(map)
        attached, rejected = each_line(photos) do |line|
          upload = claim_upload!(map, line["signed_id"])
          photo = attacher(map).photo(upload.blob) { |record| assign_photo(map, record, line) }
          upload.update!(attached_at: Time.current)
          photo
        end
        map.touch
        {
          attached: attached.map { photo_json(_1.reload) }, rejected:,
          url: "#{map_url(map)}/photos", next_step: t("notes.photos_attached")
        }
      end

      private
        def summarize_arguments(arguments) = { map_id: arguments[:map_id], photos: Array(arguments[:photos]).size }
        def summarize_result(data) = { attached: data[:attached].size, rejected: data[:rejected].size }
    end
  end
end
