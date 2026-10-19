module Mcp
  module Tools
    # « Le carnet des saisons »: the signs of the seasons the person noted on
    # their land from the phone (first frost, where frost lingers or snow
    # melts first, puddles after rain, animals' paths, nests…), where and
    # when, with the first and last day of each sign per year. Then the year
    # of observation: what was seen on the land in each season over the last
    # twelve months (signs, downpours, visit notes), so the AI knows which
    # seasons it is designing blind.
    class GetSeasonSigns < Base
      LIMIT = 200

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        features = map.features.active.where(kind: MapFeature::SeasonSign::SIGN_KIND).to_a
          .sort_by { |f| f.observed_at || f.created_at }.reverse
        listed = features.first(LIMIT)
        photos = MapPhoto.where(map:, map_feature_id: listed.map(&:id)).group(:map_feature_id).pluck(:map_feature_id, Arel.sql("array_agg(id ORDER BY id)")).to_h
        {
          signs: listed.map do |feature|
            {
              id: feature.id, sign: feature.properties.to_h["sign"], observed_at: feature.observed_at&.iso8601,
              geometry: feature.geometry_geojson, notes: feature.notes, photo_ids: photos[feature.id] || []
            }.compact
          end,
          by_sign: by_sign(features),
          year: MapFeature::SeasonSign.observation_year(map)
        }
      end

      private
        # Per sign, how often and on which days each year: the first frost of
        # every autumn, the last of every spring.
        def by_sign(features)
          features.select(&:observed_at).group_by { |f| f.properties.to_h["sign"] }.filter_map do |sign, seen|
            next unless sign

            days = seen.map { |f| f.observed_at.to_date }
            {
              sign:, count: seen.size,
              years: days.group_by(&:year).sort.map { |year, list| { year:, first: list.min.iso8601, last: list.max.iso8601, count: list.size } }
            }
          end.sort_by { |line| -line[:count] }
        end

        def summarize_result(data) = { signs: data[:signs].size }
    end
  end
end
