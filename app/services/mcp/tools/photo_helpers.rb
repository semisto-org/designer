module Mcp
  module Tools
    # What the photo tools share: a photo of the terrain as the AI reads it,
    # and the fields an AI may set on one.
    module PhotoHelpers
      MAX_PHOTOS = 50
      # A line of a call the AI must correct (unknown album, unreadable date…).
      Invalid = Class.new(StandardError)

      PLACE_PROPERTIES = {
        caption: { type: [ "string", "null" ], maxLength: 500, description: :photo_caption },
        taken_at: { type: [ "string", "null" ], format: "date-time", description: :taken_at },
        location: {
          type: [ "array", "null" ], items: { type: "number" }, minItems: 2, maxItems: 2, description: :photo_location
        },
        heading: { type: [ "number", "null" ], minimum: 0, maximum: 360, description: :heading },
        album_id: { type: [ "integer", "null" ], minimum: 1, description: :album_id },
        album_name: { type: "string", minLength: 1, maxLength: 80, description: :album_name },
        feature_id: { type: [ "integer", "null" ], minimum: 1, description: :photo_feature_id }
      }.freeze

      private
        def photo_json(photo)
          blob = photo.image.attached? ? photo.image.blob : nil
          {
            id: photo.id, caption: photo.caption, taken_at: photo.taken_at&.iso8601,
            location: photo.lnglat&.map { |v| v.round(Geo::PRECISION) }, heading: photo.heading,
            album: photo.album && { id: photo.album.id, name: photo.album.name },
            feature_id: photo.map_feature_id, source: photo.source,
            width: blob&.metadata&.dig("width"), height: blob&.metadata&.dig("height"), filename: blob&.filename&.to_s,
            uploaded_by: photo.uploaded_by&.display_name, bioindicator_status: photo.bioindicator_status,
            created_at: photo.created_at.iso8601
          }.compact
        end

        def find_photo!(map, id)
          map.photos.includes(:album, :uploaded_by, image_attachment: :blob).find_by(id:) or
            raise Invalid, t("errors.photo_not_found_plain", id:)
        end

        # Sets what the line passes (null clears). Raises Invalid.
        def assign_photo(map, photo, line)
          photo.caption = line["caption"] if line.key?("caption")
          photo.taken_at = parse_time(line["taken_at"]) if line.key?("taken_at")
          photo.heading = line["heading"] if line.key?("heading")
          if line.key?("location")
            lng, lat = line["location"]
            raise Invalid, t("photo_errors.location") if lng && !(lng.between?(-180, 180) && lat.between?(-90, 90))
            photo.location = lng && MapPhoto.point_from(lng, lat)
            photo.location_source = lng && "manual"
          end
          if line.key?("album_id")
            photo.album = line["album_id"] && (map.photo_albums.find_by(id: line["album_id"]) or raise Invalid, t("photo_errors.album", id: line["album_id"]))
          elsif (name = line["album_name"].to_s.squish).present?
            photo.album = map.photo_albums.find_by("lower(name) = lower(?)", name) || map.photo_albums.create!(name:, position: map.photo_albums.count)
          end
          if line.key?("feature_id")
            photo.map_feature = line["feature_id"] && (map.features.active.find_by(id: line["feature_id"]) or raise Invalid, t("errors.feature_not_found", id: line["feature_id"]))
          end
        end

        def parse_time(value)
          return nil if value.nil?
          Time.iso8601(value.to_s)
        rescue ArgumentError
          raise Invalid, t("photo_errors.taken_at", value:)
        end
    end
  end
end
