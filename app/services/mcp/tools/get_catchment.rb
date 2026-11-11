module Mcp
  module Tools
    # The catchment of a pond, swale or rain garden, or of a point where one
    # could go: the ground whose runoff ends up there, its area, the rain it
    # receives and the rain that fills the element. A pond is sized on what
    # drains into it, not on its own surface.
    #
    # On a territory, any point of the commune: its relief (terrain model
    # only, 10 to 30 m cells, Relief::TerrainImport) is imported on the first
    # call, in the background, and the tool says to come back in a few
    # minutes.
    class GetCatchment < Base
      include PlaceAccess

      MAX_DISTANCE_M = 1000
      # On a territory's coarse relief, a point read on a river map moves to
      # the valley floor within this distance (`outlet` says where).
      TERRITORY_SNAP_M = 90

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          feature_id: { type: "integer", minimum: 1, description: :feature_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat }
        }
      )
      hints

      def perform(map_id: nil, territory_id: nil, feature_id: nil, lng: nil, lat: nil)
        place = find_place!(map_id, territory_id)
        raise ToolError, t("tools.get_catchment.missing_point") if territory?(place) && (feature_id || lng.nil? || lat.nil?)

        catchment =
          if feature_id
            feature = place.features.where.not(status: "rejected").find_by(id: feature_id)
            raise ToolError, t("errors.feature_not_found", id: feature_id) unless feature

            Relief::Catchment.new(place, feature:)
          elsif lng && lat
            if territory?(place)
              require_point_near!(place, lng, lat, MAX_DISTANCE_M)
              territory_relief!(place)
            end
            Relief::Catchment.new(place, lng:, lat:, snap_m: (TERRITORY_SNAP_M if territory?(place)))
          else
            raise ToolError, t("tools.get_catchment.missing_target")
          end
        result = catchment.call
        {
          feature_id:, point: feature_id ? nil : [ lng, lat ],
          area_m2: result.area_m2, inside_boundary_m2: result.inside_boundary_m2, beyond_relief: result.beyond_relief,
          capacity_m3: result.capacity_m3, fill_rain_mm: result.fill_rain_mm,
          annual_rainfall_mm: result.annual_rainfall_mm, annual_rain_m3: result.annual_rain_m3,
          infiltration_mm_h: result.infiltration_mm_h, infiltration_distance_m: result.infiltration_distance_m, empties_in_h: result.empties_in_h,
          cell_size_m: result.cell_size_m, outlet: result.outlet, geometry: result.geometry,
          note: (t("tools.get_catchment.territory_note") if territory?(place))
        }.compact
      rescue Relief::Catchment::Error => e
        raise ToolError, e.message
      end

      private
        # The territory's relief, imported on first use (and again after a
        # failed or dead import). Raises while it is not ready yet.
        def territory_relief!(territory)
          terrain = territory.terrain
          return if terrain&.ready? && terrain.grid.attached?
          raise ToolError, t("errors.no_relief_provider") unless territory.region && Providers::Elevation.for(territory.region)

          if terrain.nil? || !terrain.in_progress?
            raise ToolError, t("tools.get_catchment.relief_failed", error: terrain.error) if terrain&.failed? && terrain.updated_at > 1.hour.ago

            terrain ||= territory.build_terrain
            terrain.update!(status: "pending", progress: 0, error: nil)
            ReliefImportJob.perform_later(terrain)
          end
          raise ToolError, t("tools.get_catchment.relief_pending", progress: terrain.progress.to_i)
        end

        def summarize_result(data) = { area_m2: data[:area_m2], feature_id: data[:feature_id] }.compact
    end
  end
end
