module Mcp
  module Tools
    # One photo of wild plants, as an image the AI can look at, with what it
    # needs to read it: where and when it was taken, and the curated list of
    # bio-indicator plants (keys to use in propose_bioindicators).
    class GetBioindicatorPhoto < Base
      MAX_SIDE = 1568

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photo_id: { type: "integer", minimum: 1, description: :photo_id }
        },
        required: %w[map_id photo_id]
      )
      hints

      def perform(map_id:, photo_id:)
        map = find_map!(map_id)
        photo = map.photos.find_by(id: photo_id) or raise ToolError, t("errors.photo_not_found", id: photo_id)
        @image = image_of(photo) or raise ToolError, t("errors.photo_unreadable", id: photo_id)
        {
          photo_id: photo.id, status: photo.bioindicator_status, caption: photo.caption,
          taken_at: photo.taken_at&.iso8601, location: photo.lnglat&.map { |v| v.round(Geo::PRECISION) },
          previous_analysis: photo.bioindicator_summary,
          plants_already_noted: photo.bioindicator_observations.map { |o| { name: o.species_name, status: o.status, abundance: o.abundance } },
          abundances: BioindicatorObservation::ABUNDANCES,
          bioindicator_list: SoilAnalysis::BioindicatorCatalog.all.map do |plant|
            { key: plant["key"], name: plant["name"], latin: plant["latin"], indicates: plant["indicates"] }
          end,
          next_step: t("notes.read_bioindicator_photo")
        }
      end

      private
        def content_for(data)
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        # A JPEG of at most MAX_SIDE px, rotated, without its EXIF block.
        def image_of(photo)
          return nil unless photo.image.attached?
          photo.image.variant(resize_to_limit: [ MAX_SIDE, MAX_SIDE ], format: :jpeg, saver: { strip: true, quality: 85 }).processed.download
        rescue StandardError => e
          Rails.logger.warn("[mcp] photo #{photo.id} unreadable: #{e.class}: #{e.message}")
          nil
        end

        def summarize_result(data) = { photo_id: data[:photo_id] }
    end
  end
end
