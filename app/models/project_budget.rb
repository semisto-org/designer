# « Budget du projet »: the four items every project's budget is made of
# (Michael, 2026-11-27), the same on every project so a team compares them:
#
# - services: the fees of the pre-design and design phases;
# - expenses: the costs of those phases (trips, soil analyses, printing…);
# - plants: the plants of the offer;
# - implementation: the implementation phase (planting days, its costs), the
#   supplies (mulch, guards…) and the co-management years.
#
# For each item, three figures before VAT: what was budgeted (the accepted
# offer's base, or a figure the team set by hand in maps.budget_overrides),
# what was done (hours noted against the envelope, expenses noted), and what
# was invoiced to the client (ProjectInvoice). Its state is computed, never
# chosen: not invoiced yet, partly, invoiced, or beyond the budget. Not
# accounting: no ledger, no payment matching.
class ProjectBudget
  ITEMS = ProjectInvoice::ITEMS
  DESIGN_PHASES = %w[pre_design design].freeze
  # Hours count in the item of their phase; « commercial » is the time
  # before the offer, billed with the design if at all.
  HOUR_PHASES = { "services" => %w[commercial pre_design design], "implementation" => %w[implementation] }.freeze
  IMPLEMENTATION_CATEGORIES = %w[mulch protections amendments small_material rental].freeze

  attr_reader :map

  def initialize(map, invoices: map.project_invoices.to_a, expenses: map.project_expenses.to_a,
                 entries: map.time_entries.to_a, version: TimeEntry::Envelopes.accepted_version(map))
    @map = map
    @invoices = invoices
    @expenses = expenses
    @entries = entries
    @version = version
  end

  # The item an expense weighs on: plants on plants, supplies and rentals on
  # the implementation, the rest on its phase (implementation, else costs).
  # What the client bought themselves is not the team's budget.
  def self.item_for_expense(expense)
    return nil if expense.paid_by == "client"
    return "plants" if expense.category == "plants"
    return "implementation" if IMPLEMENTATION_CATEGORIES.include?(expense.category) || expense.phase == "implementation"
    "expenses"
  end

  def items
    @items ||= ITEMS.map { item(_1) }
  end

  def totals
    budgeted = items.map { _1[:budgetCents] }
    invoiced = @invoices.sum(&:amount_cents)
    budget = budgeted.any? ? budgeted.compact.sum : nil
    {
      budgetCents: budget, invoicedCents: invoiced, vatCents: @invoices.sum(&:vat_cents),
      leftToInvoiceCents: budget && [ budget - invoiced, 0 ].max,
      paidCents: @invoices.select(&:paid?).sum(&:amount_cents),
      unpaidCents: @invoices.reject(&:paid?).sum(&:amount_cents),
      invoices: @invoices.size
    }
  end

  def version_json
    @version && { number: @version.number, label: @version.label }
  end

  def as_json(*) = { version: version_json, items:, totals: }

  # The client's side (PR 2): per item, what was agreed, invoiced and left.
  # Never what was done, nor costs, hours or margin.
  def for_client
    { items: items.map { _1.slice(:key, :budgetCents, :invoicedCents, :leftToInvoiceCents, :status) }, totals: totals.slice(:budgetCents, :invoicedCents, :leftToInvoiceCents) }
  end

  private
    def item(key)
      offer = offer_cents(key)
      manual = map.budget_overrides.to_h[key]
      budget = manual.nil? ? offer : manual.to_i
      invoiced = @invoices.sum { _1.item_cents(key) }
      spent = spent_cents(key)
      hours = hours_for(key)
      {
        key:, budgetCents: budget, budgetSource: manual.nil? ? (offer && "offer") : "manual", offerCents: offer,
        invoicedCents: invoiced, leftToInvoiceCents: budget && [ budget - invoiced, 0 ].max,
        status: status(budget, invoiced),
        spentCents: spent, hours:, km: key == "expenses" ? km : nil,
        overBudget: over_budget?(budget, spent, hours),
        plantsLeft: key == "plants" ? plants_left(budget, spent) : nil
      }
    end

    def status(budget, invoiced)
      return "not_invoiced" if invoiced.zero?
      return "partly" if budget.nil? || invoiced < budget
      invoiced == budget ? "invoiced" : "over"
    end

    def over_budget?(budget, spent, hours)
      return true if budget && spent && spent > budget
      return true if hours && hours[:envelope] && hours[:done] > hours[:envelope]
      false
    end

    # Expenses noted on this item (nil for the services, which are hours).
    def spent_cents(key)
      return nil if key == "services"
      @expenses.select { self.class.item_for_expense(_1) == key }.sum(&:amount_cents)
    end

    def hours_for(key)
      phases = HOUR_PHASES[key]
      return nil unless phases
      minutes = @entries.select { phases.include?(_1.phase) }.sum(&:minutes)
      envelope = phases.sum { |phase| phase_result(phase)&.then { _1["enabled"] == false ? 0 : _1["hours_min"].to_f } || 0 }
      { done: (minutes / 60.0).round(2), envelope: @version && envelope.positive? ? envelope.round(2) : nil }
    end

    def km = @entries.sum { _1.trip_km.to_f }.round(1)

    # What is left of the plants budget, and about how many plants that
    # buys at the offer's average price: what the team still has to plant.
    def plants_left(budget, spent)
      return nil unless budget && spent
      left = budget - spent
      plants = result["plants"].to_h
      count = plants["count_base"].to_f
      average = count.positive? && plants["plants_base"].to_f.positive? ? plants["plants_base"].to_f * 100 / count : nil
      { cents: left, count: average && left.positive? ? (left / average).floor : nil }
    end

    def result = @version&.result || {}
    def phase_result(key) = Array(result["phases"]).find { _1["key"] == key }

    def vat_factor
      pct = @version&.inputs.to_h.dig("settings", "vat_services_pct")
      1 + (pct.nil? ? 21 : pct.to_f) / 100.0
    end

    # The accepted offer's base for this item, before VAT, in cents; nil
    # without an accepted offer. Its prices are TVAC (what the client read).
    def offer_cents(key)
      return nil unless @version
      enabled = Array(result["phases"]).reject { _1["enabled"] == false }
      design = enabled.select { DESIGN_PHASES.include?(_1["key"]) }
      planting = result.dig("totals", "planting_included") != false && enabled.any? { _1["key"] == "implementation" }
      plants = result["plants"].to_h
      euros =
        case key
        when "services" then design.sum { _1.dig("prices", "fees").to_f } / vat_factor
        when "expenses" then design.sum { _1.dig("prices", "expenses").to_f } / vat_factor
        when "plants" then planting ? plants["plants_base"].to_f : 0
        when "implementation"
          phase = enabled.find { _1["key"] == "implementation" }
          co = result["co_management"].to_h
          (phase ? phase["price_tvac"].to_f / vat_factor : 0) + (planting ? plants["supplies_base"].to_f : 0) +
            (co["enabled"] ? co["amount_htva"].to_f : 0)
        end
      (euros * 100).round
    end
end
