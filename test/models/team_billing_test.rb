require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

# « Forfait de l'équipe »: a freelance designer in Semisto's team keeps their
# own maps on their own plan, and the team's maps on the team's payer.
class TeamBillingTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @payer = make_user("Semisto")
    @designer = make_user("Léa")
    @team = make_team("Semisto", admin: @payer, members: [ @designer ])
    @team.update!(billing_user: @payer)
    @payer.plan_subscriptions.create!(plan_key: "bureau", status: "active", stripe_subscription_id: "sub_team")
  end

  def map_for(owner, team: nil, name: "Carte")
    owner.owned_maps.create!(name:, organization: team)
  end

  test "a team map follows the payer's plan and leaves the designer's own allowance alone" do
    with_billing do
      own = map_for(@designer, name: "Mon jardin client")
      team_maps = 3.times.map { |i| map_for(@designer, team: @team, name: "Semisto #{i}") }

      assert_equal @payer, team_maps.first.billing_user
      assert_equal "bureau", Entitlements.for_map(team_maps.first).plan
      assert_equal "free", Entitlements.for_map(own).plan
      assert_equal [ own ], @designer.billed_maps.to_a
      assert_equal team_maps.sort_by(&:id), @payer.billed_maps.order(:id).to_a
      assert_not own.read_only_by_plan?
      assert team_maps.none?(&:read_only_by_plan?)
      # The designer's free map is used by their own map only.
      assert_not Billing::Scope.own(@designer).can_create_map?
    end
  end

  test "the payer's own maps follow the free plan, apart from the team's maps" do
    with_billing do
      team_maps = 2.times.map { |i| map_for(@payer, team: @team, name: "Semisto #{i}") }
      first = map_for(@payer, name: "Mon jardin")
      second = map_for(@payer, name: "Le jardin de ma sœur")

      # The team's plan counts the team's maps only.
      assert_equal team_maps.sort_by(&:id), @payer.billed_maps.order(:id).to_a
      assert_equal [ first, second ].sort_by(&:id), @payer.own_billed_maps.order(:id).to_a
      assert_equal "bureau", Entitlements.for_map(team_maps.first).plan
      assert_equal "free", Entitlements.for_map(first).plan
      assert team_maps.none?(&:read_only_by_plan?)
      assert_not first.read_only_by_plan?
      assert second.read_only_by_plan?
      assert_equal 1, @payer.read_only_maps_count
      assert_not Billing::Scope.own(@payer).can_create_map?
      assert Billing::Scope.for_map(team_maps.first).can_create_map?
      assert_equal 1.gigabyte, StorageUsage.for_map(first).limit_bytes
      assert_equal 120.gigabytes, StorageUsage.for_map(team_maps.first).limit_bytes

      # Once nobody's team, their plan covers their own maps again.
      @team.update!(billing_user: nil)
      assert_not second.reload.read_only_by_plan?
      assert_equal "bureau", Entitlements.for_map(second).plan
    end
  end

  test "without a payer, a team map follows its owner, as before" do
    @team.update!(billing_user: nil)
    with_billing do
      map_for(@designer, name: "Perso")
      team_map = map_for(@designer, team: @team)
      assert_equal @designer, team_map.billing_user
      assert team_map.read_only_by_plan?
    end
  end

  test "only an admin can pay, and stepping down or leaving ends it" do
    @team.billing_user = @designer
    assert_not @team.valid?

    second = make_user("Second admin")
    @team.memberships.create!(user: second, role: "admin")
    @team.memberships.find_by(user: @payer).update!(role: "member")
    assert_nil @team.reload.billing_user

    @team.update!(billing_user: second)
    @team.memberships.find_by(user: @payer).update!(role: "admin")
    @team.memberships.find_by(user: second).destroy!
    assert_nil @team.reload.billing_user
  end
end
