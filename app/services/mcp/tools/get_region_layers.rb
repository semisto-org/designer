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
        {
          region: { key: map.region.key, name: map.region.name, country_code: map.region.country_code },
          identify_available: RegionIdentify.available?,
          layers: map.region.layers.enabled.map do |layer|
            {
              key: layer.key, name: layer.name, group: layer.group_name, category: layer.category,
              identifiable: layer.identifiable?, attribution: layer.attribution,
              description: layer.options.is_a?(Hash) ? layer.options["description"] : nil
            }.compact
          end
        }
      end

      private
        def summarize_result(data) = { layers: data[:layers].size }
    end
  end
end
