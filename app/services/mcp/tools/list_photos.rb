module Mcp
  module Tools
    # The photos of the terrain, newest first: caption, date, place and
    # direction, album, linked element. get_photo shows one.
    class ListPhotos < Base
      include PhotoHelpers

      DEFAULT_LIMIT = 100
      MAX_LIMIT = 500

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          album_id: { type: "integer", minimum: 1, description: :album_id },
          feature_id: { type: "integer", minimum: 1, description: :photo_feature_id },
          unplaced: { type: "boolean", default: false, description: :unplaced },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT, description: :limit },
          after_id: { type: "integer", minimum: 0, description: :photo_after }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, album_id: nil, feature_id: nil, unplaced: false, limit: DEFAULT_LIMIT, after_id: nil)
        map = find_map!(map_id)
        scope = map.photos.includes(:album, :uploaded_by, image_attachment: :blob)
        scope = scope.where(photo_album_id: album_id) if album_id
        scope = scope.where(map_feature_id: feature_id) if feature_id
        scope = scope.unlocated if unplaced
        total = scope.count
        ordered = scope.chronological.to_a
        ordered = ordered.drop((ordered.index { _1.id == after_id } || -1) + 1) if after_id
        page = ordered.first(limit)
        counts = map.photos.group(:photo_album_id).count
        blockers = write_blockers(map)
        {
          photos: page.map { photo_json(_1) },
          count: page.size, total:,
          next_after_id: ordered.size > limit ? page.last.id : nil,
          albums: map.photo_albums.ordered.map { |album| { id: album.id, name: album.name, photos: counts[album.id].to_i } },
          url: "#{map_url(map)}/photos",
          can: { add_edit_delete: blockers.empty?, blocked_by: blockers.map { |b| t("permissions.#{b}") }.presence }.compact
        }.compact
      end

      private
        def summarize_result(data) = { photos: data[:count] }
    end
  end
end
