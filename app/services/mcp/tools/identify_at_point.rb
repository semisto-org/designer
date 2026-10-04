module Mcp
  module Tools
    class IdentifyAtPoint < Base
      MAX_LAYERS = 13
      MAX_DISTANCE_M = 1000

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat },
          layers: {
            type: "array", items: { type: "string", minLength: 1, maxLength: 80 },
            minItems: 1, maxItems: MAX_LAYERS, uniqueItems: true, description: :layers
          }
        },
        required: %w[map_id lng lat]
      )
      hints(open_world: true)

      def perform(map_id:, lng:, lat:, layers: nil)
        map = find_map!(map_id)
        raise ToolError, t("errors.point_too_far", distance: MAX_DISTANCE_M) unless near_map?(map, lng, lat)

        candidates = map.region.catalogue.enabled.select(&:identifiable?)
        candidates = candidates.select { |l| layers.include?(l.key) } if layers
        raise ToolError, t("errors.no_identifiable_layer") if candidates.empty?

        results = candidates.first(MAX_LAYERS).map do |layer|
          { layer: layer.key, name: layer.name, result: RegionIdentify.identify(map:, layer:, lng:, lat:) }
        rescue RegionIdentify::Unavailable
          { layer: layer.key, name: layer.name, error: t("errors.identify_unavailable") }
        rescue StandardError => e
          Rails.error.report(e, handled: true, context: { mcp_tool: "identify_at_point", layer: layer.key })
          { layer: layer.key, name: layer.name, error: t("errors.identify_layer_failed") }
        end
        { point: [ lng, lat ], results: }
      end

      private
        def near_map?(map, lng, lat)
          reference = map.boundary ? "boundary" : (map.center ? "center" : nil)
          return map.region.bounds.nil? || map.region.bounds.contains?(GeoJsonGeometry::FACTORY.point(lng, lat)) unless reference
          Map.where(id: map.id)
            .where("ST_DWithin(#{reference}::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)", lng, lat, MAX_DISTANCE_M)
            .exists?
        end

        def summarize_result(data) = { layers: data[:results].size, errors: data[:results].count { |r| r[:error] } }
    end
  end
end
