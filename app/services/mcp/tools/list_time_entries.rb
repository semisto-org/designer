module Mcp
  module Tools
    # « Temps et dépenses »: with a map, where its phases stand against the
    # accepted offer (envelopes of hours and km), who did what, and the
    # hours noted; for the team that runs the project only, never its
    # client. Without a map: the person's own hours (« Mes heures »), what
    # is left to invoice per recipient, and the projects they may note
    # time on. Never a rate, a price or a margin.
    class ListTimeEntries < Base
      MAX_ENTRIES = 300

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :time_map_id },
          from: { type: "string", format: "date", description: :time_from },
          to: { type: "string", format: "date", description: :time_to }
        }
      )
      hints

      def perform(map_id: nil, from: nil, to: nil)
        from = date(from)
        to = date(to)
        map_id ? project(find_map!(map_id), from, to) : mine(from, to)
      end

      private
        def project(map, from, to)
          raise ToolError, t("errors.time_not_allowed") unless TimeEntry.shown_to?(map, user)
          raise ToolError, t("errors.time_plan") unless TimeEntry.enabled_for?(map)
          all = map.time_entries.includes(:user).to_a
          envelopes = TimeEntry::Envelopes.new(map, entries: all)
          listed = within(all, from, to)
          {
            map_id: map.id, url: "#{map_url(map)}/time_entries",
            offer_version: envelopes.version_json&.slice(:label, :number),
            phases: envelopes.phases.map { phase_json(_1) },
            totals: envelopes.totals.transform_keys { _1.to_s.underscore },
            people: envelopes.people.map { { name: _1[:name], hours: _1[:hours], billable_hours: _1[:billableHours], km: _1[:km], trips: _1[:trips], by_phase: _1[:byPhase] } },
            entries: listed.sort_by { [ _1.worked_on, _1.id ] }.reverse.first(MAX_ENTRIES).map { entry_json(_1, person: true) },
            entries_count: listed.size
          }
        end

        def mine(from, to)
          from ||= Date.current.beginning_of_month unless to
          scope = user.time_entries.includes(:map)
          listed = within(scope.to_a, from, to)
          {
            url: "#{origin}/time_entries",
            entries: listed.sort_by { [ _1.worked_on, _1.id ] }.reverse.first(MAX_ENTRIES).map { entry_json(_1, project: true) },
            entries_count: listed.size,
            hours: (listed.sum(&:minutes) / 60.0).round(2),
            to_invoice: scope.to_invoice.group_by(&:bill_to).map do |bill_to, entries|
              { bill_to:, hours: (entries.sum(&:minutes) / 60.0).round(2), km: entries.sum { _1.trip_km.to_f }.round(1),
                statement_url: "#{origin}/time_entries/statement?#{{ bill_to: }.compact.to_query}" }
            end,
            projects: TimeEntry.maps_for(user).map { { map_id: _1.id, name: _1.name, team: _1.organization&.name, default_phase: TimeEntry.default_phase(_1, user) } },
            phases: TimeEntry::PHASES, non_billable_reasons: TimeEntry::NON_BILLABLE_REASONS
          }
        end

        def within(entries, from, to)
          entries.select { (from.nil? || _1.worked_on >= from) && (to.nil? || _1.worked_on <= to) }
        end

        def phase_json(phase)
          {
            phase: phase[:key], envelope_hours: phase[:envelopeHours], envelope_km: phase[:envelopeKm], in_offer: phase[:enabledInOffer],
            hours: phase[:hours], billable_hours: phase[:billableHours], non_billable_hours: phase[:nonBillableHours],
            invoiced_hours: phase[:invoicedHours], km: phase[:km], over_hours: phase[:overHours], used_pct: phase[:usedPct]
          }
        end

        def entry_json(entry, person: false, project: false)
          {
            id: entry.id, worked_on: entry.worked_on.iso8601, hours: entry.hours, phase: entry.phase,
            billable: entry.billable, non_billable_reason: entry.non_billable_reason, note: entry.note,
            bill_to: entry.bill_to, trip_km: entry.trip_km&.to_f, trip_from: entry.trip_from, trip_to: entry.trip_to,
            status: entry.status, invoice_number: entry.invoice_number,
            person: (entry.user.display_name if person), map_id: (entry.map_id if project), map_name: (entry.map.name if project)
          }.compact
        end

        def date(value)
          value && Date.iso8601(value)
        rescue Date::Error
          raise ToolError, t("errors.time_date", value:)
        end

        def summarize_result(data) = { entries: data[:entries_count] }
    end
  end
end
