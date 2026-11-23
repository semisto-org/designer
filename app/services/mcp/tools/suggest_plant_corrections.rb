module Mcp
  module Tools
    # « Suggérer une correction » for the person's AI: when a species sheet
    # of the shared catalogue is wrong (a 30 cm perennial filed as a shrub),
    # the AI suggests the right value with the page that says it. Nothing
    # changes in the catalogue: each suggestion waits for a catalogue
    # reviewer (PlantCorrection), exactly like one made from the sheet.
    class SuggestPlantCorrections < Base
      MAX_CORRECTIONS = 20

      requirement :suggest
      arguments(
        properties: {
          corrections: {
            type: "array", minItems: 1, maxItems: MAX_CORRECTIONS, description: :corrections,
            items: {
              type: "object", additionalProperties: false, required: %w[plant_id field note],
              properties: {
                plant_id: { type: "integer", minimum: 1, description: :plant_id },
                field: { type: "string", enum: PlantCorrection::FIELDS, description: :correction_field },
                value: { type: [ "string", "number" ], description: :correction_value },
                note: { type: "string", minLength: 3, maxLength: 2000, description: :correction_note },
                url: { type: "string", format: "uri", maxLength: 500, description: :correction_url }
              }
            }
          }
        },
        required: %w[corrections]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(corrections:)
        require_drafts_scope!
        results = corrections.map { |entry| suggest(entry.to_h.transform_keys(&:to_s)) }
        { corrections: results, next_step: t("notes.plant_corrections_sent") }
      end

      private
        def suggest(entry)
          species = PlantSpecies.reviewed.find_by(id: entry["plant_id"])
          return { plant_id: entry["plant_id"], error: t("errors.plant_not_found", id: entry["plant_id"]) } unless species
          correction = species.corrections.new(
            user:, origin: "ai", field: entry["field"], proposed_value: entry["value"],
            note: entry["note"], source_url: entry["url"]
          )
          return { plant_id: species.id, field: entry["field"], error: t("errors.plant_correction_invalid") } unless correction.save
          {
            plant_id: species.id, latin_name: species.latin_name, field: correction.field,
            current: correction.current_value, proposed: correction.proposed_value, status: correction.status,
            url: "#{origin}/plants/#{species.to_param}"
          }
        end

        def summarize_arguments(arguments) = { corrections: Array(arguments[:corrections]).size }
        def summarize_result(data) = { sent: data[:corrections].count { _1[:status] } }
    end
  end
end
