require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

# Every member adds maps to a team while the team has room (Michael,
# 2026-10-28): a team someone pays for counts them against that plan, so a
# member whose own plan is full still creates maps there.
class MapsInTeamTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @payer = make_user("Semisto")
    @member = make_user("Léa")
    @team = make_team("Semisto", admin: @payer, members: [ @member ])
    @team.update!(billing_user: @payer)
    @payer.plan_subscriptions.create!(plan_key: "bureau", status: "active", stripe_subscription_id: "sub_team")
    # Both have used the free plan's one map of their own.
    @payer.owned_maps.create!(name: "Mon jardin")
    @member.owned_maps.create!(name: "Le jardin de Léa")
  end

  def props(path)
    get path, headers: inertia_headers
    JSON.parse(response.body)["props"]
  end

  test "the payer's own plan is full, the team still has room: Mes cartes offers the team" do
    with_billing do
      sign_in_as @payer
      data = props(maps_path)
      assert_equal false, data["canCreate"]
      assert_equal [ { "id" => @team.id, "name" => "Semisto", "canCreate" => true } ], data["teams"]
    end
  end

  test "the new map form lists my own maps and my teams, with their room" do
    with_billing do
      sign_in_as @member
      spaces = props(new_map_path)["spaces"]
      assert_equal [
        { "teamId" => nil, "name" => nil, "canCreate" => false, "teamPaid" => false },
        { "teamId" => @team.id, "name" => "Semisto", "canCreate" => true, "teamPaid" => true }
      ], spaces
    end
  end

  test "a member creates a map in the paid team although their own plan is full" do
    with_billing do
      sign_in_as @member
      assert_difference -> { @team.maps.count } do
        post maps_path, params: { map: { name: "Verger communal", team_id: @team.id } }
      end
      map = Map.order(:id).last
      assert_equal @member, map.owner
      assert_equal @team, map.organization
      assert_equal "bureau", Entitlements.for_map(map).plan
      assert_redirected_to map_path(map)
    end
  end

  test "without a team, a full plan still refuses a new map" do
    with_billing do
      sign_in_as @member
      assert_no_difference -> { Map.count } do
        post maps_path, params: { map: { name: "Encore un jardin" } }
      end
      assert_redirected_to maps_path
    end
  end

  test "a full team plan refuses the team's new map" do
    with_billing do
      Entitlements::PLANS.fetch("bureau")[:max_maps].times { |i| @payer.owned_maps.create!(name: "Semisto #{i}", organization: @team) }
      sign_in_as @member
      assert_no_difference -> { Map.count } do
        post maps_path, params: { map: { name: "Verger communal", team_id: @team.id } }
      end
      assert_redirected_to maps_path
    end
  end

  test "a team nobody pays for counts the map against its owner's plan" do
    @team.update!(billing_user: nil)
    with_billing do
      sign_in_as @member
      assert_no_difference -> { Map.count } do
        post maps_path, params: { map: { name: "Verger communal", team_id: @team.id } }
      end
    end
  end

  test "nobody adds a map to a team they are not part of" do
    stranger = make_user("Inconnu")
    sign_in_as stranger
    assert_no_difference -> { Map.count } do
      post maps_path, params: { map: { name: "Intrus", team_id: @team.id } }
    end
    assert_redirected_to maps_path
  end

  test "get_my_plan says where a new map still fits" do
    with_billing do
      data, error = call_tool(personal_token(@member), "get_my_plan")
      refute error
      assert_equal [
        { "space" => "own", "team_id" => nil, "team_name" => nil, "can_create" => false },
        { "space" => "team", "team_id" => @team.id, "team_name" => "Semisto", "can_create" => true }
      ], data["new_map_room"]
    end
  end
end
