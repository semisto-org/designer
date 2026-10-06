module Mcp
  module Tools
    class ListFeatures < Base
      DEFAULT_LIMIT = 200
      MAX_LIMIT = 500

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          layer: { type: "string", enum: MapFeature::LAYERS, description: :layer },
          kind: { type: "string", minLength: 1, maxLength: 60, description: :kind },
          tag: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :tag },
          bbox: {
            type: "array", items: { type: "number" }, minItems: 4, maxItems: 4, description: :bbox
          },
          status: { type: "string", enum: %w[active draft all], default: "all", description: :status },
          include_networks: { type: "boolean", default: false, description: :include_networks },
          include_geometry: { type: "boolean", default: true, description: :include_geometry },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT, description: :limit },
          after_id: { type: "integer", minimum: 0, description: :after_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, layer: nil, kind: nil, tag: nil, bbox: nil, status: "all", include_networks: false,
        include_geometry: true, limit: DEFAULT_LIMIT, after_id: nil)
        map = find_map!(map_id)
        networks = networks_visible?(include_networks)
        scope = map.features.where.not(status: "rejected")
        scope = scope.where(status:) unless status == "all"
        scope = scope.where.not(layer: "networks") unless networks
        scope = scope.where(layer:) if layer
        scope = scope.where(kind:) if kind
        scope = scope.tagged(tag) if tag
        scope = scope.where("ST_Intersects(map_features.geometry, ST_MakeEnvelope(?, ?, ?, ?, 4326))", *checked_bbox(bbox)) if bbox
        total = scope.count
        scope = scope.where("map_features.id > ?", after_id) if after_id
        page = scope.order(:id).limit(limit + 1).to_a
        more = page.size > limit
        page = page.first(limit)
        {
          type: "FeatureCollection",
          features: page.map { |f| feature_json(f, geometry: include_geometry) },
          count: page.size,
          total:,
          next_after_id: more ? page.last.id : nil,
          networks: networks ? "included" : "hidden",
          note: networks_note(include_networks, networks)
        }.compact
      end

      private
        def checked_bbox(bbox)
          min_lng, min_lat, max_lng, max_lat = bbox
          valid = min_lng < max_lng && min_lat < max_lat &&
            [ min_lng, max_lng ].all? { |v| v.between?(-180, 180) } && [ min_lat, max_lat ].all? { |v| v.between?(-90, 90) }
          raise ToolError, t("errors.bbox") unless valid
          bbox
        end

        def networks_note(requested, granted)
          return t("notes.networks_editor_only") if requested && !granted
          t("notes.networks_hidden") unless granted
        end

        def summarize_result(data) = { features: data[:count], total: data[:total] }
    end
  end
end
