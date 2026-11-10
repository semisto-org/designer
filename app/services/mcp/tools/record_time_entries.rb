module Mcp
  module Tools
    # Notes hours (and the trip that went with them) for the connected
    # person, when they tell their AI what they did: « 3 h hier chez Dupont,
    # 64 km ». Their own timesheet, like the harvest log: written directly,
    # marked « Noté par ton IA », and the person changes or deletes it on
    # « Mes heures ». Never for someone else, never as invoiced. Each line
    # is all or nothing; a refused line comes back with its reason.
    class RecordTimeEntries < Base
      MAX_LINES = 50

      requirement :write
      arguments(
        properties: {
          lines: {
            type: "array", minItems: 1, maxItems: MAX_LINES, description: :time_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[map_id worked_on hours phase],
              properties: {
                map_id: { type: "integer", minimum: 1, description: :map_id },
                worked_on: { type: "string", format: "date", description: :worked_on },
                hours: { type: "number", exclusiveMinimum: 0, maximum: 24, multipleOf: 0.25, description: :time_hours },
                phase: { type: "string", enum: TimeEntry::PHASES, description: :time_phase },
                billable: { type: "boolean", default: true, description: :time_billable },
                non_billable_reason: { type: "string", enum: TimeEntry::NON_BILLABLE_REASONS, description: :time_reason },
                note: { type: "string", maxLength: 1_000, description: :time_note },
                bill_to: { type: "string", maxLength: 120, description: :time_bill_to },
                trip_km: { type: "number", exclusiveMinimum: 0, maximum: TimeEntry::MAX_TRIP_KM, description: :time_trip_km },
                trip_from: { type: "string", maxLength: 120, description: :time_trip_from },
                trip_to: { type: "string", maxLength: 120, description: :time_trip_to }
              }
            }
          }
        },
        required: %w[lines]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(lines:)
        created = []
        rejected = []
        lines.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          map = find_map!(line["map_id"])
          raise ToolError, t("errors.time_not_allowed") unless TimeEntry.usable_by?(map, user)
          require_write!(map, role: false)
          entry = user.time_entries.new(attributes(map, line))
          if entry.save
            created << entry
          else
            rejected << { index:, error: entry.errors.full_messages.to_sentence }
          end
        rescue ToolError => e
          rejected << { index:, error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        {
          created: created.map { { id: _1.id, map_id: _1.map_id, worked_on: _1.worked_on.iso8601, hours: _1.hours, phase: _1.phase, billable: _1.billable, trip_km: _1.trip_km&.to_f, bill_to: _1.bill_to }.compact },
          rejected:, url: "#{origin}/time_entries", next_step: t("notes.time_written")
        }
      end

      private
        def attributes(map, line)
          billable = line.key?("billable") ? line["billable"] : true
          {
            map:, source: "mcp", worked_on: line["worked_on"], minutes: (line["hours"].to_f * 60).round, phase: line["phase"],
            billable:, non_billable_reason: billable ? nil : (line["non_billable_reason"] || "other"),
            note: line["note"], bill_to: line.key?("bill_to") ? line["bill_to"] : TimeEntry.default_bill_to(map, user),
            trip_km: line["trip_km"], trip_from: line["trip_from"], trip_to: line["trip_to"]
          }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
