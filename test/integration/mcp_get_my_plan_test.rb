require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/billing_test_helper"

class McpGetMyPlanTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  test "get_my_plan says what the plan does for the person's places, and what happens if they stop" do
    user = users(:bob)
    user.plan_purchases.create!(plan_key: "yearly", starts_at: 1.month.ago, expires_at: 11.months.from_now, stripe_checkout_session_id: "cs_1")
    first = Map.create!(name: "Le verger", owner: user, region: regions(:wallonia), created_at: 2.days.ago)
    Map.create!(name: "La mare", owner: user, region: regions(:wallonia))
    token = personal_token(user)
    with_billing do
      data, error = call_tool(token, "get_my_plan")
      refute error
      assert_equal({ "key" => "yearly", "name" => "Home" }, data["plan"])
      assert_equal "ends_unless_renewed", data.dig("renewal", "kind")
      assert_equal 3, data.dig("includes", "max_active_maps")
      assert_equal 2, data.dig("usage", "active_maps")
      assert_equal [ "Le verger", "La mare" ], data["places"].map { _1["name"] }
      assert_equal({ "id" => first.id, "name" => "Le verger" }, data.dig("if_i_stop", "stays_editable"))
      assert_equal 1, data.dig("if_i_stop", "become_read_only")
      assert_equal "http://www.example.com/billing", data["plans_url"]
    end
    assert_equal({ "places" => 2 }, AiAction.last.result)
  end

  test "on the free plan there is nothing to stop" do
    data, = call_tool(personal_token(users(:bob)), "get_my_plan")
    assert_equal "free", data.dig("plan", "key")
    assert_nil data["if_i_stop"]
    assert_nil data["renewal"]
  end
end
