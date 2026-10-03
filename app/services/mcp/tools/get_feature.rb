module Mcp
  module Tools
    class GetFeature < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_id: { type: "integer", minimum: 1, description: :feature_id }
        },
        required: %w[map_id feature_id]
      )
      hints

      def perform(map_id:, feature_id:)
        map = find_map!(map_id)
        feature = map.features.where.not(status: "rejected").find_by(id: feature_id)
        feature = nil if feature&.layer == "networks" && !editor?
        raise ToolError, t("errors.feature_not_found", id: feature_id) unless feature
        measures = feature.measure_geometry.transform_keys { |k| "#{k}_m#{k == 'area' ? '2' : ''}" }
        feature_json(feature).merge(
          measures: measures.reject { |_, v| v.zero? },
          created_at: feature.created_at.iso8601
        )
      end

      private
        def summarize_result(data) = { feature_id: data[:id], layer: data.dig(:properties, "layer") }
    end
  end
end
