# A project's « Temps et dépenses »: where each phase stands against the
# accepted offer (TimeEntry::Envelopes), the hours and trips of everyone on
# it, the expenses and who paid them (ProjectExpense::Summary), and forms
# to note one's own. For the team that runs the project (TimeEntry.shown_to?).
# Without a Pro or Team plan, the page says what it would bring (PlanGate).
#
# The client (a viewer) reads another page, once the team turned on
# « Montrer au client »: each phase's progress in %, the expenses and who
# paid them, and their own purchases to add. Never names, rates or hours.
module Maps
  class TimeEntriesController < ApplicationController
    include MapScoped
    include TimeEntryForms

    before_action :set_map
    before_action :require_shown!

    def index
      return client_view if ProjectExpense.client_view?(@map, Current.user)
      usable = TimeEntry.enabled_for?(@map)
      props = {
        map: map_props, place: place_props,
        canUse: usable, canUpgrade: @map.billing_user == Current.user
      }
      return render(inertia: "maps/time_entries/index", props:) unless usable
      entries = @map.time_entries.includes(:user).order(worked_on: :desc, id: :desc).to_a
      expenses = load_expenses
      render inertia: "maps/time_entries/index", props: props.merge(
        canWrite: writable?,
        envelopes: TimeEntry::Envelopes.new(@map, entries:).as_json,
        entries: entries.map(&:as_json),
        me: time_entry_choice(@map),
        billToSuggestions: bill_to_suggestions,
        catalog: time_entry_catalog,
        today: Date.current.iso8601,
        expenses: expenses.map { expense_json(_1, client: false) },
        expenseSummary: ProjectExpense::Summary.new(@map, expenses:).as_json,
        expenseCatalog: expense_catalog,
        sharedWithClient: @map.time_shared_with_client,
        hasViewers: @map.memberships.where(role: "viewer").exists? || @map.invitations.where(role: "viewer", accepted_at: nil).exists?
      )
    end

    private
      def require_shown!
        redirect_to map_path(@map) unless TimeEntry.tab_for?(@map, Current.user)
      end

      def writable? = !@map.read_only_by_plan? && !@map.archived?

      def map_props
        { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id, offerBuilder: Offer.shown_to?(@map, Current.user),
          teamName: @map.organization&.name }
      end

      def place_props = { id: @map.id, name: @map.name, boundary: @map.geometry_geojson(:boundary), areaM2: @map.area_m2 }

      def load_expenses = @map.project_expenses.includes(:user, receipt_attachment: :blob).order(spent_on: :desc, id: :desc).to_a

      def expense_json(expense, client:)
        url = expense.receipt.attached? ? receipt_map_project_expense_path(@map, expense) : nil
        expense.as_json(client:, viewer: Current.user, receipt_url: url)
      end

      def expense_catalog
        { categories: ProjectExpense::CATEGORIES, payers: ProjectExpense::PAYERS, vatRates: ProjectExpense::VAT_RATES, phases: TimeEntry::PHASES }
      end

      # What the client reads: progress per phase (capped at 100 %), the
      # expenses (never who noted them, nor the team's prices, suppliers and
      # notes) and how many lines each payer carries.
      def client_view
        envelopes = TimeEntry::Envelopes.new(@map)
        expenses = load_expenses
        summary = ProjectExpense::Summary.new(@map, expenses:)
        phases = envelopes.phases.select { _1[:envelopeHours].to_f.positive? && _1[:enabledInOffer] != false }.map do |phase|
          { key: phase[:key], pct: [ phase[:usedPct].to_i, 100 ].min, started: phase[:hours].positive?, lastOn: phase[:lastOn] }
        end
        render inertia: "maps/time_entries/client", props: {
          map: map_props.merge(timeEntries: true), place: place_props,
          version: envelopes.version_json&.slice(:label),
          phases:,
          expenses: expenses.map { expense_json(_1, client: true) },
          **summary.for_client,
          canWrite: writable?, expenseCatalog: expense_catalog.merge(payers: [ "client" ]),
          today: Date.current.iso8601
        }
      end
  end
end
