module Mcp
  module Tools
    # The exact contour line through a point of the terrain, from the relief
    # the person has downloaded: what a swale, a keyline or a hedge across
    # the slope must follow before it is proposed with propose_features.
    class TraceContour < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat }
        },
        required: %w[map_id lng lat]
      )
      hints

      def perform(map_id:, lng:, lat:)
        map = find_map!(map_id)
        result = Relief::Contour.new(map, lng:, lat:).call
        { point: [ lng, lat ], elevation_m: result.elevation_m, length_m: result.length_m, closed: result.closed,
          geometry: result.geometry, cell_size_m: map.terrain.cell_size_m }
      rescue Relief::Contour::Error => e
        raise ToolError, e.message
      end

      private
        def summarize_result(data) = { length_m: data[:length_m], elevation_m: data[:elevation_m] }
    end
  end
end
