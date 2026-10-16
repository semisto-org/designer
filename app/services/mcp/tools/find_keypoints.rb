module Mcp
  module Tools
    # The keypoints of the terrain's valleys, each with its keyline: where a
    # swale or a line of trees gathers a valley's water and spreads it onto
    # the ridges, the first lines of a keyline design.
    class FindKeypoints < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        result = Relief::Keypoints.new(map).call
        {
          keypoints: result.keypoints.map do |k|
            {
              point: [ k.lng, k.lat ], elevation_m: k.elevation_m, slope_above_pct: k.slope_above_pct, slope_below_pct: k.slope_below_pct,
              catchment_m2: k.catchment_m2, valley: k.valley,
              keyline: k.keyline && { geometry: k.keyline.geometry, length_m: k.keyline.length_m }
            }.compact
          end,
          cell_size_m: result.cell_size_m, min_catchment_m2: result.min_catchment_m2
        }
      rescue Relief::Keypoints::Error => e
        raise ToolError, e.message
      end

      private
        def summarize_result(data) = { keypoints: data[:keypoints].size }
    end
  end
end
