module Mcp
  module Tools
    # The catchment of a pond, swale or rain garden, or of a point where one
    # could go: the ground whose runoff ends up there, its area, the rain it
    # receives and the rain that fills the element. A pond is sized on what
    # drains into it, not on its own surface.
    class GetCatchment < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          feature_id: { type: "integer", minimum: 1, description: :feature_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, feature_id: nil, lng: nil, lat: nil)
        map = find_map!(map_id)
        catchment =
          if feature_id
            feature = map.features.where.not(status: "rejected").find_by(id: feature_id)
            raise ToolError, t("errors.feature_not_found", id: feature_id) unless feature

            Relief::Catchment.new(map, feature:)
          elsif lng && lat
            Relief::Catchment.new(map, lng:, lat:)
          else
            raise ToolError, t("tools.get_catchment.missing_target")
          end
        result = catchment.call
        {
          feature_id:, point: feature_id ? nil : [ lng, lat ],
          area_m2: result.area_m2, inside_boundary_m2: result.inside_boundary_m2, beyond_relief: result.beyond_relief,
          capacity_m3: result.capacity_m3, fill_rain_mm: result.fill_rain_mm,
          annual_rainfall_mm: result.annual_rainfall_mm, annual_rain_m3: result.annual_rain_m3,
          cell_size_m: result.cell_size_m, geometry: result.geometry
        }.compact
      rescue Relief::Catchment::Error => e
        raise ToolError, e.message
      end

      private
        def summarize_result(data) = { area_m2: data[:area_m2], feature_id: data[:feature_id] }.compact
    end
  end
end
