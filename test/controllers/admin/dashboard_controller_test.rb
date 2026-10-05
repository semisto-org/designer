require "test_helper"

class Admin::DashboardControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  def props = response.parsed_body["props"]

  test "requires sign in, and admins only" do
    get admin_dashboard_path
    assert_redirected_to new_session_path
    sign_in_as users(:alice)
    get admin_dashboard_path
    assert_response :not_found
  end

  test "shows the figures, the latest accounts and maps, and the log" do
    AdminEvent.record!("admin_granted", admin: @admin, target: users(:bob))
    sign_in_as @admin
    get admin_dashboard_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/dashboard/show", response.parsed_body["component"]
    assert_equal User.count, props["stats"]["users"]["total"]
    assert_equal Map.active.count, props["stats"]["maps"]["total"]
    assert_equal 12, props["stats"]["signupsByWeek"].size
    assert_equal "staff@example.org", props["recentUsers"].first["email"]
    assert_equal [ "admin_granted" ], props["events"].map { |event| event["action"] }
    assert props["recentMaps"].all? { |map| map["owner"]["email"].present? }
  end
end
