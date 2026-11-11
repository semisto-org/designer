module Mcp
  module Tools
    # The water of a territory as the region's water authority publishes it
    # (TerritoryHydrography): classified watercourses with their manager,
    # runoff axes, water bodies and the sub-basins with a ready basin draft.
    class GetHydrography < Base
      include TerritoryAccess

      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          min_runoff_class: { type: "integer", minimum: 1, maximum: 5, description: :min_runoff_class },
          outlines: { type: "boolean", description: :outlines }
        },
        required: %w[territory_id]
      )
      hints(open_world: true)

      def perform(territory_id:, min_runoff_class: nil, outlines: true)
        territory = find_territory!(territory_id)
        hydrography = TerritoryHydrography.new(territory)
        raise ToolError, t("errors.hydrography_not_configured") unless hydrography.available?

        data = hydrography.call(min_runoff_class:, outlines:)
        { territory_id: territory.id, **data, note: t("tools.get_hydrography.note") }.compact
      rescue TerritoryHydrography::Unavailable
        raise ToolError, t("errors.hydrography_unavailable")
      end

      private
        def summarize_result(data)
          { watercourses: data[:watercourses].size, sub_basins: data[:sub_basins].size, water_bodies: data[:water_bodies].size }
        end
    end
  end
end
