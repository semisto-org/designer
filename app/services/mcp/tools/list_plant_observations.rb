module Mcp
  module Tools
    # The journals of a map's plants (« Journal du plant »), newest first:
    # every dated entry (take, flowering, pruning, damage…) with its author,
    # and the state of each plant from its latest take (established,
    # struggling, dead).
    class ListPlantObservations < Base
      include PlantLookup

      MAX_LIMIT = 500

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_ids: { type: "array", maxItems: 500, items: { type: "integer", minimum: 1 }, description: :harvest_feature_ids },
          numbers: { type: "array", maxItems: 500, items: { type: "string", minLength: 1, maxLength: 20 }, description: :harvest_numbers },
          kind: { type: "string", enum: PlantObservation::KINDS, description: :observation_kind_filter },
          since: { type: "string", format: "date", description: :observations_since },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: :limit }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, feature_ids: nil, numbers: nil, kind: nil, since: nil, limit: 200)
        map = find_map!(map_id)
        scope = PlantObservation.where(map_id: map.id).joins(:map_feature).merge(MapFeature.active)
        if feature_ids.present? || numbers.present?
          plants = plants_for(map, { "feature_ids" => feature_ids, "numbers" => numbers })
          scope = scope.where(map_feature_id: plants.map(&:id))
        end
        scope = scope.where(kind:) if kind
        scope = scope.where(observed_on: Date.iso8601(since)..) if since
        entries = scope.includes(:user, :map_feature, photo_attachment: :blob).order(observed_on: :desc, id: :desc).limit(limit).to_a
        latest = PlantObservation.latest_per_plant.where(map_id: map.id, map_feature_id: entries.map(&:map_feature_id).uniq)
        {
          entries: entries.map { |o| o.as_json.except(:photoUrl, :thumbUrl).merge(plant: plant_label(o.map_feature), hasPhoto: o.photo.attached?) },
          states: latest.map { |o| { featureId: o.map_feature_id, survival: o.survival, vigor: o.vigor, observedOn: o.observed_on.iso8601 } },
          vocabulary: { kinds: PlantObservation::KINDS, survivals: PlantObservation::SURVIVALS },
          url: map_url(map)
        }
      rescue Invalid, Date::Error => e
        raise ToolError, e.message
      end

      private
        def plant_label(feature)
          number = feature.plant_number
          [ number && "n° #{number}", feature.name ].compact_blank.join(" — ")
        end

        def summarize_result(data) = { entries: data[:entries].size }
    end
  end
end
