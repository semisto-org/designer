module Mcp
  module Tools
    # The fruit stores of a map (cellar, cold room, barn… drawn as
    # « Lieu de stockage des fruits ») with their temperature and humidity
    # readings and what they mean for keeping apples and pears.
    class ListStorageReadings < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        stores = map.features.active.where(kind: StorageReading::STORE_KIND).includes(storage_readings: :user).order(:id)
        {
          stores: stores.map { store_json(_1) },
          ranges: StorageClimate.ranges,
          url: map_url(map)
        }
      end

      private
        def store_json(store)
          readings = store.storage_readings.to_a
          summary = StorageClimate.summary(readings)
          {
            id: store.id, name: store.name, store_type: store.properties["store_type"],
            summary:, advice: advice(summary[:latest]&.dig(:verdict)),
            readings: readings.reverse.map(&:as_json)
          }
        end

        def advice(verdict)
          return [] unless verdict
          temperature = verdict[:temperature]
          humidity = verdict[:humidity]
          keys = []
          if temperature&.dig(:status) == "frost" then keys << "frost"
          elsif temperature&.dig(:side) == "warm" then keys << (temperature[:status] == "bad" ? "warm_bad" : "warm_fair")
          end
          if humidity&.dig(:side) == "dry" then keys << (humidity[:status] == "bad" ? "dry_bad" : "dry_fair")
          elsif humidity&.dig(:side) == "wet" then keys << "wet"
          end
          keys.map { I18n.t("storage_readings.advice.#{_1}") }
        end

        def summarize_result(data) = { stores: data[:stores].size }
    end
  end
end
