module Mcp
  module Tools
    # Adds a photo to the terrain from its bytes (base64): one the person
    # gave the AI, or one the AI made. Placed, dated, captioned and filed
    # like any other; a photo already on the map is refused.
    class AddPhoto < Base
      include PhotoHelpers

      MAX_BYTES = 15.megabytes

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          image_base64: { type: "string", minLength: 16, maxLength: (MAX_BYTES * 4 / 3) + 4, description: :image_base64 },
          filename: { type: "string", minLength: 1, maxLength: 120, description: :photo_filename },
          caption: { type: "string", maxLength: 500, description: :photo_caption },
          taken_at: { type: "string", format: "date-time", description: :taken_at },
          location: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: :photo_location },
          heading: { type: "number", minimum: 0, maximum: 360, description: :heading },
          album_id: { type: "integer", minimum: 1, description: :album_id },
          album_name: PLACE_PROPERTIES[:album_name],
          feature_id: { type: "integer", minimum: 1, description: :photo_feature_id }
        },
        required: %w[map_id image_base64]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, image_base64:, filename: nil, **fields)
        map = find_map!(map_id)
        require_write!(map)
        bytes = decode(image_base64)
        type = Marcel::MimeType.for(StringIO.new(bytes))
        raise ToolError, t("photo_errors.type") unless MapPhoto::UPLOAD_TYPES.include?(type)
        photo = map.photos.new(uploaded_by: user, source: "import")
        photo.image.attach(io: StringIO.new(bytes), filename: filename_for(filename, type), content_type: type)
        begin
          assign_photo(map, photo, fields.transform_keys(&:to_s))
        rescue Invalid => e
          raise ToolError, e.message
        end
        raise ToolError, t("errors.photo_invalid", details: photo.errors.full_messages.to_sentence) unless photo.save
        photo_json(photo).merge(url: "#{map_url(map)}/photos", next_step: t("notes.photo_added"))
      rescue ActiveRecord::RecordNotUnique
        raise ToolError, t("errors.photo_invalid", details: t("photo_errors.duplicate"))
      end

      private
        def decode(value)
          data = value.sub(/\Adata:[^;,]+;base64,/, "")
          bytes = Base64.strict_decode64(data.delete("\n\r "))
          raise ToolError, t("photo_errors.too_large", max: MAX_BYTES / 1.megabyte) if bytes.bytesize > MAX_BYTES
          bytes
        rescue ArgumentError
          raise ToolError, t("photo_errors.base64")
        end

        def filename_for(name, type)
          ext = type == "image/jpeg" ? "jpg" : type.split("/").last
          base = File.basename(name.to_s, ".*").parameterize.presence || "photo-#{Time.current.strftime('%Y%m%d-%H%M%S')}"
          "#{base}.#{ext}"
        end

        def summarize_arguments(arguments)
          arguments.except(:image_base64).merge(image_bytes: arguments[:image_base64].to_s.size * 3 / 4)
            .transform_values { |v| v.is_a?(String) ? v.first(200) : v }
        end

        def summarize_result(data) = { photo_id: data[:id] }
    end
  end
end
