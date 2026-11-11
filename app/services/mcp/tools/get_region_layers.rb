module Mcp
  module Tools
    class GetRegionLayers < Base
      include PlaceAccess

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id }
        }
      )
      hints

      def perform(map_id: nil, territory_id: nil)
        place = find_place!(map_id, territory_id)
        region = require_region!(place)
        layers = place_layers(place)
        # A partial flight is judged at the place's center (for a territory,
        # a point inside the commune).
        uncovered = PhotoArchive::Coverage.uncovered(place)
        {
          region: { key: region.key, name: region.name, country_code: region.country_code },
          identify_available: layers.any?(&:identifiable?),
          layers: layers.map do |layer|
            {
              key: layer.key, name: layer.name, group: layer.group_name, category: layer.category,
              identifiable: layer.identifiable?, attribution: layer.attribution,
              description: layer.description, legend: layer.legend
            }.merge(photo_json(layer)).compact
          end,
          # The flights through time, oldest first: get_aerial_photo shows any of them.
          aerial_photos: PhotoArchive.vintages(region, uncovered:).presence
        }.compact
      end

      private
        def photo_json(layer)
          return {} unless layer.photo?

          { year: layer.option(:year), season: layer.option(:season), infrared_of: layer.option(:infrared_of) }
        end

        def summarize_result(data) = { layers: data[:layers].size }
    end
  end
end
