module Mcp
  module Tools
    # The harvest log of a map (« Récoltes »): every fruit plant season by
    # season (fruit seen on the tree, picked, nothing), where the fruit went,
    # and the plants with nothing for several followed seasons.
    class ListHarvests < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          season: { type: "integer", minimum: 1900, maximum: 2200, description: :season }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, season: nil)
        map = find_map!(map_id)
        log = HarvestLog.new(map, season: season || Date.current.year)
        lines = map.plant_harvests.in_season(log.season).includes(:user).newest_first
        log.as_json.merge(
          lines: lines.map(&:as_json),
          vocabulary: { stages: PlantHarvest::STAGES, amounts: PlantHarvest::AMOUNTS, uses: PlantHarvest::USES },
          url: "#{map_url(map)}?panel=harvests"
        )
      end

      private
        def summarize_result(data) = { plants: data[:plants].size, lines: data[:lines].size }
    end
  end
end
