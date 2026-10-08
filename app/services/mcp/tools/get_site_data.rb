module Mcp
  module Tools
    # What the external data sources say about the map's place, in one call:
    # sun and horizon (PVGIS), nearby weather stations (IRM), the climate
    # observed over 30 years (ERA5-Land), the trees already there (Meta/WRI
    # canopy height) and the town-planning rules and risks (France). Each
    # topic reuses the report the editor panel shows, without the heavy
    # drawing data (sun path points, canopy grid), and says why it is missing
    # when its source is not configured or does not answer.
    class GetSiteData < Base
      TOPICS = {
        "sun" => ->(map) { Sun::MapReport.new(map).as_json },
        "weather_stations" => ->(map) { WeatherStations::MapReport.new(map).as_json },
        "observed_climate" => ->(map) { ObservedClimate::MapReport.new(map).as_json },
        "canopy" => ->(map) { Canopy::MapReport.new(map).as_json }
      }.freeze

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          topics: {
            type: "array", items: { type: "string", enum: TOPICS.keys },
            minItems: 1, uniqueItems: true, description: :topics
          }
        },
        required: %w[map_id]
      )
      hints(open_world: true)

      def perform(map_id:, topics: nil)
        map = find_map!(map_id)
        (topics || TOPICS.keys).index_with { |topic| fetch(topic, map) }
      end

      private
        def fetch(topic, map)
          data = TOPICS.fetch(topic).call(map)
          slim(topic, data.deep_stringify_keys).deep_transform_keys(&:underscore)
        rescue StandardError => e
          Rails.error.report(e, handled: true, context: { mcp_tool: "get_site_data", topic: })
          { "available" => false, "reason" => "upstream_error" }
        end

        # Drawing data is for the editor; the AI gets the figures.
        def slim(topic, data)
          case topic
          when "sun" then data.merge("paths" => Array(data["paths"]).map { _1.except("points") })
          when "canopy" then data.except("grid")
          else data
          end
        end

        def summarize_result(data) = { topics: data.keys.size, available: data.count { |_, v| v["available"] } }
    end
  end
end
