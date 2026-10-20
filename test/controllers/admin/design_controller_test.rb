require "test_helper"

class Admin::DesignControllerTest < ActionDispatch::IntegrationTest
  test "regular users get a 404" do
    sign_in_as users(:michael)
    get admin_design_path
    assert_response :not_found
  end

  test "shows the primitives and what the design guard still tolerates" do
    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    get admin_design_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/design/show", response.parsed_body["component"]
    guard = response.parsed_body.dig("props", "guard")
    assert_equal Admin::DesignGuard::RULES.sort, guard["totals"].keys.sort
    assert_operator guard["fileCount"], :>=, guard["files"].size
  end
end
