module Mcp
  module Tools
    # Adds dated entries to the journal of planted plants (« Journal du
    # plant »): their take (survival), flowering, a pruning, damage, a disease,
    # an intervention. Like the harvest log, the journal is the team's
    # notebook, not the design: the AI writes it directly when the person
    # tells what happened, and an entry never rewrites the earlier ones. Each
    # entry is all or nothing for its plants; a refused one comes back with
    # its reason.
    class RecordPlantObservations < Base
      include PlantLookup

      MAX_ENTRIES = 100
      MAX_PLANTS = 500

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          entries: {
            type: "array", minItems: 1, maxItems: MAX_ENTRIES, description: :observation_entries,
            items: {
              type: "object", additionalProperties: false, required: %w[observed_on kind],
              properties: {
                feature_ids: { type: "array", maxItems: MAX_PLANTS, items: { type: "integer", minimum: 1 }, description: :harvest_feature_ids },
                numbers: { type: "array", maxItems: MAX_PLANTS, items: { type: "string", minLength: 1, maxLength: 20 }, description: :harvest_numbers },
                observed_on: { type: "string", format: "date", description: :observed_on },
                kind: { type: "string", enum: PlantObservation::KINDS, description: :observation_kind },
                survival: { type: "string", enum: PlantObservation::SURVIVALS, description: :observation_survival },
                vigor: { type: "integer", minimum: 1, maximum: 5, description: :observation_vigor },
                note: { type: "string", maxLength: 2000, description: :observation_note }
              }
            }
          }
        },
        required: %w[map_id entries]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, entries:)
        map = find_map!(map_id)
        require_write!(map)
        created = []
        rejected = []
        entries.each_with_index do |entry, index|
          entry = entry.to_h.transform_keys(&:to_s)
          plants = plants_for(map, entry)
          # Like the harvest log and the plant sheet: a plant still to plant
          # has no journal yet.
          if (unplanted = plants.reject(&:planted?)).any?
            raise Invalid, t("journal_errors.not_planted", plants: unplanted.map { |p| p.plant_number ? "n° #{p.plant_number}" : "##{p.id}" }.join(", "))
          end
          observations = plants.map { _1.plant_observations.new(attributes(entry)) }
          if (invalid = observations.find(&:invalid?))
            rejected << { index:, error: "#{invalid.map_feature.name.presence || "##{invalid.map_feature_id}"} : #{invalid.errors.full_messages.to_sentence}" }
          else
            PlantObservation.transaction { observations.each(&:save!) }
            created.concat(observations)
          end
        rescue Invalid => e
          rejected << { index:, error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        { created: created.map(&:as_json), rejected:, url: map_url(map), next_step: t("notes.observations_written") }
      end

      private
        def attributes(entry)
          {
            user:, observed_on: entry["observed_on"], kind: entry["kind"], survival: entry["survival"],
            vigor: entry["vigor"], note: entry["note"].to_s.strip.presence
          }
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], entries: Array(arguments[:entries]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
