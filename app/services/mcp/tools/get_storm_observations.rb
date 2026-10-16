module Mcp
  module Tools
    # What the person saw on their land during downpours: where water ran,
    # stood or came out of the ground, when, under what rain, and whether
    # it agrees with the flow the relief predicts. Where it does not, the
    # land holds something the relief cannot see (a drain, a ditch, ruts,
    # compacted soil), and the observation outweighs the model.
    class GetStormObservations < Base
      LIMIT = 50

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        features = map.features.active.where(kind: MapFeature::StormObservation::STORM_KIND).to_a
          .sort_by { |f| f.observed_at || f.created_at }.reverse.first(LIMIT)
        photos = MapPhoto.where(map:, map_feature_id: features.map(&:id)).group(:map_feature_id).pluck(:map_feature_id, Arel.sql("array_agg(id ORDER BY id)")).to_h
        {
          observations: features.map do |feature|
            p = feature.properties.to_h
            {
              id: feature.id, water: p["water"], observed_at: feature.observed_at&.iso8601, geometry: feature.geometry_geojson,
              rain: p["rain"], rain_mm: p["rain_mm"], muddy: p["muddy"], name: feature.name, notes: feature.notes,
              photo_ids: photos[feature.id] || [], relief: relief(map, feature)
            }.compact
          end
        }
      end

      private
        def relief(map, feature)
          Relief::StormCheck.new(map, feature:).call.as_json.transform_keys { |k| k.to_s.underscore }.compact
        rescue Relief::StormCheck::Error => e
          { unavailable: e.message }
        end

        def summarize_result(data) = { observations: data[:observations].size }
    end
  end
end
