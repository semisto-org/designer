require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# A project's expenses: what is valid, who may note which, and how they
# weigh against the accepted offer.
class ProjectExpenseTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  def expense(**attributes)
    ProjectExpense.new({ map: @map, user: @designer, spent_on: Date.current, label: "Broyat", category: "mulch",
                         amount_cents: 48_000, vat_rate: 21, paid_by: "rebilled" }.merge(attributes))
  end

  test "an expense has an amount, a category, a payer and a known VAT rate" do
    assert expense.valid?
    refute expense(amount_cents: 0).valid?
    refute expense(category: "beer").valid?
    refute expense(paid_by: "nobody").valid?
    refute expense(vat_rate: 7).valid?
    refute expense(spent_on: Date.current + 60).valid?
    assert_equal 10_080, expense.vat_cents
    assert_equal 58_080, expense.total_cents
  end

  test "plants go at 6 %, the rest at 21 %" do
    assert_equal 6, ProjectExpense.default_vat_rate("plants")
    assert_equal 21, ProjectExpense.default_vat_rate("mulch")
  end

  test "the team notes any expense; the client only their own purchases, once shown the project" do
    assert expense.writable_by?(@designer)
    alice = users(:alice)
    refute expense(user: alice, paid_by: "client").writable_by?(alice)
    @map.update!(time_shared_with_client: true)
    assert expense(user: alice, paid_by: "client").writable_by?(alice)
    refute expense(user: alice, paid_by: "rebilled").writable_by?(alice)
    theirs = expense(paid_by: "client").tap(&:save!)
    refute theirs.writable_by?(alice), "a purchase the team noted stays the team's"
  end

  test "the client never reads who noted an expense, nor the team's receipts" do
    json = expense.as_json(client: true, viewer: users(:alice))
    refute json.key?(:userName)
    assert_nil json[:receipt]
  end

  test "the summary weighs plants and supplies against the accepted offer, and adds up each payer" do
    offer = Offer.build_for(@map)
    offer.save!
    version = offer.save_version!(user: users(:michael))
    version.update!(status: "accepted", result: version.result.merge("plants" => { "plants_base" => 1_000.0, "supplies_base" => 400.0 }))
    expense(category: "plants", amount_cents: 120_000, vat_rate: 6).save!
    expense(category: "mulch", amount_cents: 30_000, paid_by: "client").save!
    summary = ProjectExpense::Summary.new(@map)
    plants = summary.by_group.find { _1[:group] == "plants" }
    assert_equal [ 120_000, 100_000, 20_000 ], plants.values_at(:amountCents, :plannedCents, :overCents)
    supplies = summary.by_group.find { _1[:group] == "supplies" }
    assert_nil supplies[:overCents]
    assert_equal({ "rebilled" => 120_000, "client" => 30_000 }, summary.by_payer.to_h { [ _1[:paidBy], _1[:amountCents] ] })
  end
end
