module Mcp
  module Tools
    # Notes harvest lines in a map's log, for plants named by id or by their
    # number on the plan. Like tasks, the harvest log is the team's notebook,
    # not the design: the AI writes it directly when the person tells what
    # was seen or picked, and the journal keeps the trace. Each line is all
    # or nothing for its plants; a refused line comes back with its reason.
    class RecordHarvests < Base
      include PlantLookup

      MAX_LINES = 50
      MAX_PLANTS = 500

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          lines: {
            type: "array", minItems: 1, maxItems: MAX_LINES, description: :harvest_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[noted_on stage],
              properties: {
                feature_ids: { type: "array", maxItems: MAX_PLANTS, items: { type: "integer", minimum: 1 }, description: :harvest_feature_ids },
                numbers: { type: "array", maxItems: MAX_PLANTS, items: { type: "string", minLength: 1, maxLength: 20 }, description: :harvest_numbers },
                noted_on: { type: "string", format: "date", description: :noted_on },
                stage: { type: "string", enum: PlantHarvest::STAGES, description: :harvest_stage },
                amount: { type: "string", enum: PlantHarvest::AMOUNTS, description: :harvest_amount },
                uses: { type: "array", uniqueItems: true, items: { type: "string", enum: PlantHarvest::USES }, description: :harvest_uses },
                quantity_kg: { type: "number", exclusiveMinimum: 0, maximum: 99_999, description: :quantity_kg },
                note: { type: "string", maxLength: PlantHarvest::NOTE_MAX_LENGTH, description: :harvest_note }
              }
            }
          }
        },
        required: %w[map_id lines]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, lines:)
        map = find_map!(map_id)
        require_write!(map)
        created = []
        rejected = []
        lines.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          plants = plants_for(map, line)
          harvests = plants.map { _1.plant_harvests.new(attributes(line)) }
          if (invalid = harvests.find(&:invalid?))
            rejected << { index:, error: invalid.errors.full_messages.to_sentence }
          else
            PlantHarvest.transaction { harvests.each(&:save!) }
            created.concat(harvests)
          end
        rescue Invalid => e
          rejected << { index:, error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        { created: created.map(&:as_json), rejected:, url: "#{map_url(map)}?panel=harvests", next_step: t("notes.harvests_written") }
      end

      private
        def attributes(line)
          {
            user:, noted_on: line["noted_on"], stage: line["stage"], amount: line["amount"],
            uses: Array(line["uses"]), quantity_kg: line["quantity_kg"], note: line["note"]
          }
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], lines: Array(arguments[:lines]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
