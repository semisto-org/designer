module Mcp
  module Tools
    # One photo of the terrain, as an image to look at (without its EXIF
    # block), with what is known of it.
    class GetPhoto < Base
      include PhotoHelpers

      MAX_SIDE = 1568

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photo_id: { type: "integer", minimum: 1, description: :any_photo_id }
        },
        required: %w[map_id photo_id]
      )
      hints

      def perform(map_id:, photo_id:)
        map = find_map!(map_id)
        photo = begin
          find_photo!(map, photo_id)
        rescue Invalid => e
          raise ToolError, e.message
        end
        @image = image_of(photo) or raise ToolError, t("errors.photo_unreadable", id: photo_id)
        photo_json(photo).merge(camera: photo.camera.presence, url: "#{map_url(map)}/photos").compact
      end

      private
        def content_for(data)
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        def image_of(photo)
          return nil unless photo.image.attached?
          # A video gives its still frame (Active Storage preview).
          photo.image.representation(resize_to_limit: [ MAX_SIDE, MAX_SIDE ], format: :jpeg, saver: { strip: true, quality: 85 }).processed.download
        rescue StandardError => e
          Rails.logger.warn("[mcp] photo #{photo.id} unreadable: #{e.class}: #{e.message}")
          nil
        end

        def summarize_result(data) = { photo_id: data[:id] }
    end
  end
end
