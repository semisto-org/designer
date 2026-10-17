module Mcp
  module Tools
    # Notes temperature and humidity readings of the map's fruit stores.
    # Like the harvest log, the readings are the team's notebook, not the
    # design: the AI writes them directly when the person gives them, and
    # the journal keeps the trace. A refused reading comes back with its
    # reason; the others are kept.
    class RecordStorageReadings < Base
      MAX_READINGS = 100

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          readings: {
            type: "array", minItems: 1, maxItems: MAX_READINGS, description: :storage_readings,
            items: {
              type: "object", additionalProperties: false, required: %w[store_id measured_on],
              properties: {
                store_id: { type: "integer", minimum: 1, description: :store_id },
                measured_on: { type: "string", format: "date", description: :measured_on },
                temperature_c: { type: "number", minimum: -39, maximum: 59, description: :temperature_c },
                temperature_min_c: { type: "number", minimum: -39, maximum: 59, description: :temperature_min_c },
                temperature_max_c: { type: "number", minimum: -39, maximum: 59, description: :temperature_max_c },
                humidity_pct: { type: "integer", minimum: 0, maximum: 100, description: :humidity_pct },
                note: { type: "string", maxLength: StorageReading::NOTE_MAX_LENGTH, description: :storage_note }
              }
            }
          }
        },
        required: %w[map_id readings]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, readings:)
        map = find_map!(map_id)
        require_write!(map)
        stores = map.features.active.where(kind: StorageReading::STORE_KIND).index_by(&:id)
        created = []
        rejected = []
        readings.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          store = stores[line["store_id"].to_i]
          unless store
            rejected << { index:, error: t("storage_errors.not_found", id: line["store_id"]) }
            next
          end
          reading = store.storage_readings.new(line.slice(*%w[measured_on temperature_c temperature_min_c temperature_max_c humidity_pct note]).merge(user:))
          if reading.save
            created << reading
          else
            rejected << { index:, error: reading.errors.full_messages.to_sentence }
          end
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        { created: created.map(&:as_json), rejected:, url: map_url(map), next_step: t("notes.storage_written") }
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], readings: Array(arguments[:readings]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
