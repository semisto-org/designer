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
          return client(map) if ProjectExpense.client_view?(map, user)
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
            entries_count: listed.size,
            expenses: map.project_expenses.includes(:user).order(spent_on: :desc, id: :desc).map { expense_json(_1, person: true) },
            expense_summary: expense_summary(map),
            expense_categories: ProjectExpense::CATEGORIES, payers: ProjectExpense::PAYERS,
            shown_to_client: map.time_shared_with_client
          }
        end

        # The client's view (« Montrer au client » on): progress per phase in
        # %, the expenses and who paid them. Never names, hours or rates, nor
        # the team's purchase prices, suppliers and notes.
        def client(map)
          envelopes = TimeEntry::Envelopes.new(map)
          summary = ProjectExpense::Summary.new(map)
          {
            map_id: map.id, url: "#{map_url(map)}/time_entries", view: "client",
            phases: envelopes.phases.select { _1[:envelopeHours].to_f.positive? && _1[:enabledInOffer] != false }
                              .map { { phase: _1[:key], progress_pct: [ _1[:usedPct].to_i, 100 ].min } },
            expenses: map.project_expenses.order(spent_on: :desc, id: :desc).map { client_expense_json(_1) },
            by_payer: summary.for_client[:byPayer].map { { paid_by: _1[:paidBy], count: _1[:count], amount_eur: _1[:amountCents]&.then { |c| c / 100.0 } }.compact },
            own_purchases_eur: summary.for_client[:totals][:amountCents] / 100.0,
            entries_count: 0
          }
        end

        def expense_summary(map)
          summary = ProjectExpense::Summary.new(map)
          {
            total_eur: summary.totals[:amountCents] / 100.0, total_with_vat_eur: summary.totals[:totalCents] / 100.0,
            planned_eur: summary.totals[:plannedCents]&.then { _1 / 100.0 },
            by_payer: summary.by_payer.map { { paid_by: _1[:paidBy], amount_eur: _1[:amountCents] / 100.0 } },
            by_group: summary.by_group.map { { group: _1[:group], amount_eur: _1[:amountCents] / 100.0, planned_eur: _1[:plannedCents]&.then { |c| c / 100.0 }, over_eur: _1[:overCents]&.then { |c| c / 100.0 } } }
          }
        end

        def expense_json(expense, person:)
          {
            id: expense.id, spent_on: expense.spent_on.iso8601, label: expense.label, supplier: expense.supplier,
            category: expense.category, phase: expense.phase, amount_eur: expense.amount, vat_rate: expense.vat_rate,
            paid_by: expense.paid_by, note: expense.note, receipt: expense.receipt.attached?,
            person: (expense.user&.display_name if person)
          }.compact
        end

        # The same line as the client's page shows it (ProjectExpense#as_json
        # with client: true): never the team's prices, suppliers or notes.
        def client_expense_json(expense)
          json = expense.as_json(client: true, viewer: user)
          {
            id: expense.id, spent_on: json[:spentOn], label: json[:label], supplier: json[:supplier],
            category: json[:category], amount_eur: json[:amountCents]&.then { _1 / 100.0 },
            vat_rate: (json[:vatRate] if json[:amountCents]), paid_by: json[:paidBy], note: json[:note], mine: json[:mine]
          }.compact
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
