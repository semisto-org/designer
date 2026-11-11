require "test_helper"

class IdleSessionTest < ActionDispatch::IntegrationTest
  test "a browser not seen for a year has to sign in again" do
    sign_in_as users(:michael)
    Current.session.update_columns(updated_at: 13.months.ago)
    get maps_path, headers: inertia_headers
    assert_redirected_to new_session_path
  end

  test "coming back within the year keeps the browser signed in and refreshes its date" do
    sign_in_as users(:michael)
    session = Current.session
    session.update_columns(updated_at: 2.months.ago)
    get maps_path, headers: inertia_headers
    assert_response :success
    assert_in_delta Time.current, session.reload.updated_at, 5
  end
end
