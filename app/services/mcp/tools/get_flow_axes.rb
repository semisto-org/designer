module Mcp
  module Tools
    # The flow axes around a point: the lines where runoff gathers, each with
    # the ground it drains. On a territory, from its fine relief (5 m, a
    # window of about 2.5 km imported on demand, Relief::DetailWindow): the
    # scale of a street, a field edge or a dry valley, where a « sol » or
    # « ralentir » lead belongs. On a map, from the map's own relief.
    class GetFlowAxes < Base
      include PlaceAccess

      MAX_DISTANCE_M = 1000
      DEFAULT_MIN_DRAINED_M2 = 5_000

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat },
          min_drained_m2: { type: "integer", minimum: 200, maximum: 1_000_000, description: :min_drained_m2 }
        },
        required: %w[lng lat]
      )
      hints

      def perform(lng:, lat:, map_id: nil, territory_id: nil, min_drained_m2: DEFAULT_MIN_DRAINED_M2)
        place = find_place!(map_id, territory_id)
        require_point_near!(place, lng, lat, MAX_DISTANCE_M)
        terrain = territory?(place) ? window_terrain!(place, lng, lat) : place.terrain
        raise ToolError, t("tools.get_flow_axes.no_relief") unless terrain&.ready? && terrain.grid.attached?

        Rails.cache.fetch([ "relief/flow_axes/v1", terrain.id, terrain.version, min_drained_m2 ], expires_in: 1.week) do
          grid = Relief::FlowGrid.new(terrain)
          axes = Relief::FlowAxes.new(grid, min_drained_m2:)
          found = axes.call
          {
            cell_size_m: grid.cell_m.round(2), window: grid.extent.bbox_wgs84.map { |v| v.round(6) },
            min_drained_m2: axes.min_drained_m2.round, count: found.size, axes: axes.as_geojson(found)
          }
        end.merge(point: [ lng, lat ], note: t("tools.get_flow_axes.note"))
      end

      private
        def window_terrain!(territory, lng, lat)
          raise ToolError, t("errors.no_relief_provider") unless territory.region && Providers::Elevation.for(territory.region)

          relief = Relief::TerritoryRelief.new(territory, window: Relief::DetailWindow.for_point(lng, lat))
          relief.ensure!
          return relief.terrain if relief.ready?

          state = relief.state
          key = state[:status] == "failed" ? "failed" : "pending"
          raise ToolError, t("tools.get_flow_axes.#{key}", error: state[:error].to_s) + " " +
                           t("tools.get_catchment.relief.state", state: state.to_json)
        end

        def summarize_result(data) = { count: data[:count], min_drained_m2: data[:min_drained_m2] }
    end
  end
end
