require "test_helper"

class Admin::ImpersonationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @alice = users(:alice)
  end

  def props = response.parsed_body["props"]

  def whoami
    get account_path, headers: inertia_headers
    assert_response :success
    props
  end

  test "an admin signs in as someone: logged, banner props, then back to their own account" do
    sign_in_as @admin
    assert_difference -> { AdminEvent.where(action: "impersonation_started").count } do
      post admin_user_impersonation_path(@alice)
    end
    assert_redirected_to maps_path
    event = AdminEvent.newest_first.first
    assert_equal [ @admin, @alice ], [ event.admin, event.target_user ]
    assert_equal "staff@example.org", event.details["admin_email"]

    me = whoami
    assert_equal "alice@example.org", me["currentUser"]["email"]
    assert_equal false, me["currentUser"]["admin"]
    assert_equal "Alice", me["impersonation"]["userName"]
    assert_equal "Staff", me["impersonation"]["adminName"]
    assert_equal @admin, Session.find_by(user: @alice).impersonator

    # The admin screens are out of reach meanwhile: Alice is no admin.
    get admin_dashboard_path
    assert_response :not_found

    assert_difference -> { AdminEvent.where(action: "impersonation_ended").count } do
      delete impersonation_path
    end
    assert_redirected_to admin_users_path(q: "alice@example.org")
    assert_equal "stopped", AdminEvent.newest_first.first.details["reason"]
    assert_not Session.exists?(user: @alice)

    me = whoami
    assert_equal "staff@example.org", me["currentUser"]["email"]
    assert_nil me["impersonation"]
  end

  test "the impersonation ends by itself after an hour" do
    sign_in_as @admin
    post admin_user_impersonation_path(@alice)
    travel 61.minutes do
      me = whoami
      assert_equal "staff@example.org", me["currentUser"]["email"]
      assert_nil me["impersonation"]
    end
    assert_equal "expired", AdminEvent.newest_first.first.details["reason"]
    assert_not Session.exists?(user: @alice)
  end

  test "signing out while impersonating signs the admin out too" do
    sign_in_as @admin
    post admin_user_impersonation_path(@alice)
    delete session_path
    assert_equal "sign_out", AdminEvent.newest_first.first.details["reason"]
    assert_equal 0, Session.where(user: [ @admin, @alice ]).count
    get maps_path
    assert_redirected_to new_session_path
  end

  test "money, credentials and the account stay with the person" do
    sign_in_as @admin
    post admin_user_impersonation_path(@alice)

    post billing_checkout_path, params: { plan: "yearly" }
    assert_redirected_to root_path
    assert_match "Pas pendant une connexion", flash[:alert]

    patch account_path, params: { user: { name: "Pirate" } }
    assert_equal "Alice", @alice.reload.name

    post account_api_tokens_path, params: { api_token: { name: "x" } }, as: :json
    assert_response :forbidden
    assert_equal 0, ApiToken.where(user: @alice).count
  end

  test "no impersonating oneself or another admin" do
    other_admin = User.create!(email_address: "staff2@example.org", admin: true)
    sign_in_as @admin
    assert_no_difference("Session.count") do
      post admin_user_impersonation_path(@admin)
      post admin_user_impersonation_path(other_admin)
    end
    assert_equal 0, AdminEvent.count
    assert_equal "staff@example.org", whoami["currentUser"]["email"]
  end

  test "regular users get a 404 and nothing happens" do
    sign_in_as @alice
    assert_no_difference("Session.count") { post admin_user_impersonation_path(users(:bob)) }
    assert_response :not_found
  end

  test "ending without an impersonation goes back to the maps" do
    sign_in_as @admin
    delete impersonation_path
    assert_redirected_to maps_path
    assert_equal "staff@example.org", whoami["currentUser"]["email"]
  end

  test "when the admin's own session is gone, ending signs out" do
    sign_in_as @admin
    post admin_user_impersonation_path(@alice)
    Session.where(user: @admin).destroy_all
    delete impersonation_path
    assert_redirected_to new_session_path
    get maps_path
    assert_redirected_to new_session_path
  end
end
