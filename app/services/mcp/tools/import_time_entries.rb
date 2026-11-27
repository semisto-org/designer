module Mcp
  module Tools
    # Brings a team member's hours from another tool (Semisto's internal app,
    # a spreadsheet) onto a project, when the team moves its timesheets into
    # Terranova. Only a team admin of the map (or the owner of a map without
    # a team) imports, for the people who take part in the project; each line
    # carries where it came from (external_ref), so a second run notes
    # nothing twice. The lines show « Importé par l'équipe », never as
    # invoiced: their author still corrects or deletes them on « Mes heures ».
    class ImportTimeEntries < Base
      MAX_LINES = 100

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          lines: {
            type: "array", minItems: 1, maxItems: MAX_LINES, description: :import_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[person worked_on hours phase external_ref],
              properties: {
                person: { type: "string", minLength: 1, maxLength: 120, description: :import_person },
                external_ref: { type: "string", minLength: 1, maxLength: 200, description: :import_ref },
                worked_on: { type: "string", format: "date", description: :worked_on },
                hours: { type: "number", exclusiveMinimum: 0, maximum: 24, multipleOf: 0.25, description: :time_hours },
                phase: { type: "string", enum: TimeEntry::PHASES, description: :time_phase },
                billable: { type: "boolean", default: true, description: :time_billable },
                non_billable_reason: { type: "string", enum: TimeEntry::NON_BILLABLE_REASONS, description: :time_reason },
                note: { type: "string", maxLength: 1_000, description: :time_note },
                bill_to: { type: "string", maxLength: 120, description: :time_bill_to },
                trip_km: { type: "number", exclusiveMinimum: 0, maximum: TimeEntry::MAX_TRIP_KM, description: :time_trip_km }
              }
            }
          }
        },
        required: %w[map_id lines]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, lines:)
        map = find_map!(map_id)
        raise ToolError, t("errors.import_not_allowed") unless importer?(map)
        raise ToolError, t("errors.time_plan") unless TimeEntry.enabled_for?(map)
        require_write!(map, role: false)

        people = map.participants.or(User.where(id: map.owner_id)).to_a
        created = []
        skipped = []
        rejected = []
        lines.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          if map.time_entries.exists?(external_ref: line["external_ref"])
            skipped << { index:, external_ref: line["external_ref"] }
            next
          end
          person = find_person(people, line["person"])
          raise ToolError, t("errors.import_person", name: line["person"]) unless person && TimeEntry.shown_to?(map, person)
          entry = person.time_entries.new(attributes(map, person, line))
          if entry.save
            created << entry
          else
            rejected << { index:, error: entry.errors.full_messages.to_sentence }
          end
        rescue ToolError => e
          rejected << { index:, error: e.message }
        end
        {
          created: created.map { { id: _1.id, person: _1.user.display_name, worked_on: _1.worked_on.iso8601, hours: _1.hours, phase: _1.phase, billable: _1.billable, external_ref: _1.external_ref } },
          skipped:, rejected:, totals: totals(created),
          url: "#{origin}/maps/#{map.id}/time_entries", next_step: t("notes.time_imported")
        }
      end

      private
        def importer?(map)
          map.organization ? map.organization.admin?(user) : map.owner_id == user.id
        end

        # The person as list_teams names them, without regard to case; a name
        # two people share is refused rather than guessed.
        def find_person(people, name)
          wanted = name.to_s.strip.downcase
          found = people.select { |p| [ p.display_name, p.name ].compact.map(&:downcase).include?(wanted) }
          found.one? ? found.first : nil
        end

        def attributes(map, person, line)
          billable = line.key?("billable") ? line["billable"] : true
          {
            map:, source: "import", external_ref: line["external_ref"], worked_on: line["worked_on"],
            minutes: (line["hours"].to_f * 60).round, phase: line["phase"],
            billable:, non_billable_reason: billable ? nil : (line["non_billable_reason"] || "other"),
            note: line["note"], bill_to: line.key?("bill_to") ? line["bill_to"] : TimeEntry.default_bill_to(map, person),
            trip_km: line["trip_km"]
          }
        end

        def totals(entries)
          entries.group_by(&:user).map do |person, own|
            { person: person.display_name, lines: own.size, hours: (own.sum(&:minutes) / 60.0).round(2),
              billable_hours: (own.select(&:billable).sum(&:minutes) / 60.0).round(2), km: own.sum { _1.trip_km.to_f } }
          end
        end

        def summarize_result(data) = { created: data[:created].size, skipped: data[:skipped].size, rejected: data[:rejected].size }
    end
  end
end
