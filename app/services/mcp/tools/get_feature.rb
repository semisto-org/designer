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
          created_at: feature.created_at.iso8601,
          **plant_journal(feature)
        )
      end

      private
        JOURNAL_ENTRIES = 20

        # For a plant: its latest entries (list_plant_observations for all of
        # them) and its state from the latest take.
        def plant_journal(feature)
          return {} unless feature.plant?
          entries = feature.plant_observations.includes(:user).reorder(observed_on: :desc, id: :desc).limit(JOURNAL_ENTRIES)
          state = feature.plant_observations.where.not(survival: nil).reorder(observed_on: :desc, id: :desc).first
          {
            journal: entries.map { |o| o.as_json.except(:photoUrl, :thumbUrl, :featureId) },
            journal_total: feature.plant_observations.count,
            state: state && { survival: state.survival, vigor: state.vigor, observed_on: state.observed_on.iso8601 }
          }
        end

        def summarize_result(data) = { feature_id: data[:id], layer: data.dig(:properties, "layer") }
    end
  end
end
