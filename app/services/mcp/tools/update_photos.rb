module Mcp
  module Tools
    # Changes photos of the terrain: caption, date, place and direction,
    # album (found or made by name), linked element. Only the fields passed
    # change; null clears one. The image itself never changes.
    class UpdatePhotos < Base
      include PhotoHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photos: {
            type: "array", minItems: 1, maxItems: PhotoHelpers::MAX_PHOTOS, description: :photo_changes,
            items: {
              type: "object", additionalProperties: false, required: %w[photo_id], minProperties: 2,
              properties: { photo_id: { type: "integer", minimum: 1, description: :any_photo_id }, **PhotoHelpers::PLACE_PROPERTIES }
            }
          }
        },
        required: %w[map_id photos]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, photos:)
        map = find_map!(map_id)
        require_write!(map)
        updated = []
        rejected = []
        photos.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          photo = find_photo!(map, line["photo_id"])
          MapPhoto.transaction do
            assign_photo(map, photo, line)
            photo.save!
          end
          updated << photo
        rescue Invalid => e
          rejected << { index:, photo_id: line["photo_id"], error: e.message }
        rescue ActiveRecord::RecordInvalid => e
          rejected << { index:, photo_id: line["photo_id"], error: e.record.errors.full_messages.to_sentence }
        end
        if updated.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        { updated: updated.map { photo_json(_1.reload) }, rejected:, url: "#{map_url(map)}/photos" }
      end

      private
        def summarize_arguments(arguments) = { map_id: arguments[:map_id], photos: Array(arguments[:photos]).size }
        def summarize_result(data) = { updated: data[:updated].size, rejected: data[:rejected].size }
    end
  end
end
