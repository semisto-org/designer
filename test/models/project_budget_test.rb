require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# The four items of a project's budget: budgeted from the accepted offer or
# by hand, done, invoiced, and the state computed from them.
class ProjectBudgetTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @map.update!(organization: @team)
  end

  def accept_offer(result)
    offer = Offer.build_for(@map)
    offer.save!
    version = offer.save_version!(user: users(:michael))
    version.update!(status: "accepted", result: version.result.merge(result))
    version
  end

  def item(key) = ProjectBudget.new(@map).items.find { _1[:key] == key }

  test "without an offer nor a figure set by hand, no item has a budget" do
    assert_nil item("services")[:budgetCents]
    assert_equal "not_invoiced", item("services")[:status]
    assert_nil ProjectBudget.new(@map).totals[:budgetCents]
  end

  test "the accepted offer gives each item its base before VAT" do
    accept_offer(
      "phases" => [
        { "key" => "pre_design", "enabled" => true, "hours_min" => 10, "prices" => { "fees" => 1_210, "expenses" => 121 }, "price_tvac" => 1_331 },
        { "key" => "design", "enabled" => true, "hours_min" => 20, "prices" => { "fees" => 2_420, "expenses" => 0 }, "price_tvac" => 2_420 },
        { "key" => "implementation", "enabled" => true, "hours_min" => 16, "prices" => { "fees" => 968, "expenses" => 242 }, "price_tvac" => 1_210 }
      ],
      "plants" => { "plants_base" => 2_000.0, "supplies_base" => 300.0, "count_base" => 200 },
      "co_management" => { "enabled" => false },
      "totals" => { "planting_included" => true }
    )
    assert_equal 300_000, item("services")[:budgetCents]
    assert_equal 10_000, item("expenses")[:budgetCents]
    assert_equal 200_000, item("plants")[:budgetCents]
    assert_equal 130_000, item("implementation")[:budgetCents]
    assert_equal({ done: 0.0, envelope: 30.0 }, item("services")[:hours])
  end

  test "an amount set by hand wins over the offer, and invoices set each item's state" do
    @map.update!(budget_overrides: { "services" => 100_000, "plants" => 50_000 })
    @map.project_invoices.create!(number: "1", issued_on: Date.current, services_cents: 40_000, plants_cents: 50_000)
    @map.project_invoices.create!(number: "2", issued_on: Date.current, paid_on: Date.current, expenses_cents: 5_000)
    budget = ProjectBudget.new(@map)
    services = budget.items.find { _1[:key] == "services" }
    assert_equal [ 100_000, "manual", 40_000, 60_000, "partly" ], services.values_at(:budgetCents, :budgetSource, :invoicedCents, :leftToInvoiceCents, :status)
    assert_equal "invoiced", budget.items.find { _1[:key] == "plants" }[:status]
    assert_equal "partly", budget.items.find { _1[:key] == "expenses" }[:status], "invoiced without a budget is only partly known"
    assert_equal [ 150_000, 95_000, 90_000 ], budget.totals.values_at(:budgetCents, :invoicedCents, :unpaidCents)
  end

  test "expenses weigh on their item, the client's own purchases on none, and the plants left are counted" do
    accept_offer("plants" => { "plants_base" => 1_000.0, "count_base" => 100, "supplies_base" => 0 }, "totals" => { "planting_included" => true },
                 "phases" => [ { "key" => "implementation", "enabled" => true, "prices" => {}, "price_tvac" => 0 } ])
    base = { user: users(:bob), spent_on: Date.current, label: "x", vat_rate: 21 }
    @map.project_expenses.create!(base.merge(category: "plants", amount_cents: 40_000, paid_by: "rebilled"))
    @map.project_expenses.create!(base.merge(category: "plants", amount_cents: 99_000, paid_by: "client"))
    @map.project_expenses.create!(base.merge(category: "mulch", amount_cents: 12_000, paid_by: "team"))
    @map.project_expenses.create!(base.merge(category: "analysis", amount_cents: 8_000, paid_by: "rebilled"))
    assert_equal 40_000, item("plants")[:spentCents]
    assert_equal({ cents: 60_000, count: 60 }, item("plants")[:plantsLeft])
    assert_equal 12_000, item("implementation")[:spentCents]
    assert_equal 8_000, item("expenses")[:spentCents]
    refute item("plants")[:overBudget]
    @map.project_invoices.create!(number: "F", issued_on: Date.current, plants_cents: 120_000)
    assert_equal "over", item("plants")[:status]
  end

  test "the client's side keeps budgets and invoices, never what was done" do
    view = ProjectBudget.new(@map).for_client
    refute view[:items].first.key?(:spentCents)
    refute view[:items].first.key?(:hours)
  end
end
