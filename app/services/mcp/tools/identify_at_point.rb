module Mcp
  module Tools
    class IdentifyAtPoint < Base
      include PlaceAccess

      MAX_LAYERS = 13
      MAX_DISTANCE_M = 1000

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat },
          layers: {
            type: "array", items: { type: "string", minLength: 1, maxLength: 80 },
            minItems: 1, maxItems: MAX_LAYERS, uniqueItems: true, description: :layers
          }
        },
        required: %w[lng lat]
      )
      hints(open_world: true)

      def perform(lng:, lat:, map_id: nil, territory_id: nil, layers: nil)
        place = find_place!(map_id, territory_id)
        require_region!(place)
        require_point_near!(place, lng, lat, MAX_DISTANCE_M)

        candidates = place_layers(place).select(&:identifiable?)
        candidates = candidates.select { |l| layers.include?(l.key) } if layers
        raise ToolError, t("errors.no_identifiable_layer") if candidates.empty?

        results = candidates.first(MAX_LAYERS).map do |layer|
          { layer: layer.key, name: layer.name, result: RegionIdentify.identify(layer:, lng:, lat:) }
        rescue RegionIdentify::Unavailable
          { layer: layer.key, name: layer.name, error: t("errors.identify_unavailable") }
        rescue StandardError => e
          Rails.error.report(e, handled: true, context: { mcp_tool: "identify_at_point", layer: layer.key })
          { layer: layer.key, name: layer.name, error: t("errors.identify_layer_failed") }
        end
        { point: [ lng, lat ], results: }
      end

      private
        def summarize_result(data) = { layers: data[:results].size, errors: data[:results].count { |r| r[:error] } }
    end
  end
end
