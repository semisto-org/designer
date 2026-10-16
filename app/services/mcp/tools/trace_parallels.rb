module Mcp
  module Tools
    # Lines parallel to a keyline of the map, above and below it: where the
    # next swales, rows of trees or subsoiling lines of a keyline design go.
    class TraceParallels < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_id: { type: "integer", minimum: 1, description: :feature_id },
          spacing_m: { type: "number", minimum: 1, maximum: 100, description: :spacing_m },
          above: { type: "integer", minimum: 0, maximum: Relief::Parallels::MAX_PER_SIDE, description: :above },
          below: { type: "integer", minimum: 0, maximum: Relief::Parallels::MAX_PER_SIDE, description: :below }
        },
        required: %w[map_id feature_id spacing_m above below]
      )
      hints

      def perform(map_id:, feature_id:, spacing_m:, above:, below:)
        map = find_map!(map_id)
        feature = map.features.where.not(status: "rejected").find_by(id: feature_id)
        raise ToolError, t("errors.feature_not_found", id: feature_id) unless feature

        lines = Relief::Parallels.new(map, feature:, spacing_m:, above:, below:).call
        {
          feature_id:, spacing_m:,
          lines: lines.map { |l| { side: l.side, rank: l.rank, offset_m: l.offset_m, length_m: l.length_m, fall_m: l.fall_m, geometry: l.geometry }.compact }
        }
      rescue Relief::Parallels::Error => e
        raise ToolError, e.message
      end

      private
        def summarize_result(data) = { lines: data[:lines].size, feature_id: data[:feature_id] }
    end
  end
end
