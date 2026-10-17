require "test_helper"

class Admin::TechControllerTest < ActionDispatch::IntegrationTest
  test "regular users get a 404" do
    sign_in_as users(:michael)
    get admin_tech_path
    assert_response :not_found
  end

  test "shows the version, files, jobs and services" do
    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    get admin_tech_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/tech/show", response.parsed_body["component"]
    tech = response.parsed_body.dig("props", "tech")
    assert_equal %w[jobs services sobriety storage version], tech.keys.sort
    assert_equal false, tech.dig("jobs", "available")
  end
end
