module Mcp
  module Tools
    class GetRegionLayers < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        layers = map.region.catalogue.enabled.to_a
        uncovered = PhotoArchive::Coverage.uncovered(map)
        {
          region: { key: map.region.key, name: map.region.name, country_code: map.region.country_code },
          identify_available: layers.any?(&:identifiable?),
          layers: layers.map do |layer|
            {
              key: layer.key, name: layer.name, group: layer.group_name, category: layer.category,
              identifiable: layer.identifiable?, attribution: layer.attribution,
              description: layer.description, legend: layer.legend
            }.merge(photo_json(layer)).compact
          end,
          # The flights through time, oldest first: get_aerial_photo shows any of them.
          aerial_photos: PhotoArchive.vintages(map.region, uncovered:).presence
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
