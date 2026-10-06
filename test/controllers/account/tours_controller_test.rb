require "test_helper"

class Account::ToursControllerTest < ActionDispatch::IntegrationTest
  test "requires sign in" do
    patch account_tour_path, as: :json
    assert_response :redirect
  end

  test "remembers the first time the carnet de route was closed" do
    user = users(:michael)
    sign_in_as user
    get account_path, headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "currentUser", "tourSeen")

    patch account_tour_path, as: :json
    assert_response :no_content
    seen_at = user.reload.tour_seen_at
    assert seen_at

    # Reopened and closed later: the first date stays.
    travel 1.day do
      patch account_tour_path, as: :json
    end
    assert_equal seen_at, user.reload.tour_seen_at

    get account_path, headers: inertia_headers
    assert_equal true, response.parsed_body.dig("props", "currentUser", "tourSeen")
  end

  test "an admin signed in as someone does not use up their first visit" do
    admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    sign_in_as admin
    post admin_user_impersonation_path(users(:alice))

    patch account_tour_path, as: :json
    assert_response :no_content
    assert_nil users(:alice).reload.tour_seen_at
  end
end
