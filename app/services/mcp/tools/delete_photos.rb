module Mcp
  module Tools
    # Deletes photos of the terrain, with their sketches and renderings, as
    # « Supprimer » does on the Photos page: only when the person asked for
    # it, photo by photo. Cannot be undone.
    class DeletePhotos < Base
      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photo_ids: {
            type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: PhotoHelpers::MAX_PHOTOS,
            uniqueItems: true, description: :photo_ids
          }
        },
        required: %w[map_id photo_ids]
      )
      hints(read_only: false, destructive: true, idempotent: true)

      def perform(map_id:, photo_ids:)
        map = find_map!(map_id)
        require_write!(map)
        photos = map.photos.where(id: photo_ids).to_a
        photos.each(&:destroy!)
        deleted = photos.map(&:id)
        { deleted:, not_found: photo_ids - deleted, photos_left: map.photos.count }
      end

      private
        def summarize_result(data) = { deleted: data[:deleted].size, photo_ids: data[:deleted] }
    end
  end
end
