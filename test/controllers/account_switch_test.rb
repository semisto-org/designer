require "test_helper"

# « Changer de compte »: a freelance designer signed in with their own address
# and their @semisto.org one on the same browser.
class AccountSwitchTest < ActionDispatch::IntegrationTest
  setup do
    @own = users(:alice)
    @semisto = users(:bob)
  end

  def props = response.parsed_body["props"]

  def sign_in_with_code(user)
    code = user.issue_sign_in_code!
    post session_code_path, params: { email_address: user.email_address, code: }
  end

  test "adding a second account keeps the first one a click away, both ways" do
    sign_in_with_code @own
    get new_session_path(add: 1), headers: inertia_headers
    assert_response :success
    assert_equal @own.email_address, props["addingTo"]

    sign_in_with_code @semisto
    get maps_path, headers: inertia_headers
    assert_equal "bob@example.org", props["currentUser"]["email"]
    others = props["otherAccounts"]
    assert_equal [ "alice@example.org" ], others.map { _1["email"] }

    post switch_session_path(others.first["sessionId"])
    assert_redirected_to maps_path
    get maps_path, headers: inertia_headers
    assert_equal "alice@example.org", props["currentUser"]["email"]
    assert_equal [ "bob@example.org" ], props["otherAccounts"].map { _1["email"] }
  end

  test "signing out hands over to the other account, then signs out for good" do
    sign_in_with_code @own
    sign_in_with_code @semisto

    delete session_path
    assert_redirected_to maps_path
    get maps_path, headers: inertia_headers
    assert_equal "alice@example.org", props["currentUser"]["email"]
    assert_empty props["otherAccounts"]

    delete session_path
    assert_redirected_to root_path
    get maps_path
    assert_redirected_to new_session_path
  end

  test "signing in again as the same account adds nobody" do
    sign_in_with_code @own
    sign_in_with_code @own
    get maps_path, headers: inertia_headers
    assert_empty props["otherAccounts"]
  end

  test "a session that is not one of mine on this browser cannot be switched to" do
    stranger = users(:michael).sessions.create!
    sign_in_with_code @own
    post switch_session_path(stranger.id)
    assert_redirected_to maps_path
    get maps_path, headers: inertia_headers
    assert_equal "alice@example.org", props["currentUser"]["email"]
  end

  test "without ?add, a signed-in visitor of the sign-in page goes to their maps" do
    sign_in_with_code @own
    get new_session_path
    assert_redirected_to maps_path
  end
end
