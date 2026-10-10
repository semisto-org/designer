require "test_helper"
require_relative "../test_helpers/collab_test_helper"

# The accept flows: e-mail invitation (/invitations/:token) and share link (/join/:token).
class JoiningTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @bob = users(:bob)
  end

  test "signed-out visitor is sent to sign in, then lands back on the invitation and joins" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "editor", invited_by: @owner)
    get invitation_path(invitation.token)
    assert_redirected_to new_session_path
    follow_redirect!
    assert_equal I18n.t("collab.joining.sign_in_first", map: @map.name), flash[:notice]

    # Signing in (the magic link carries return_to) brings them back to the invitation.
    post magic_link_path(@bob.generate_token_for(:magic_link), return_to: invitation_path(invitation.token))
    assert_redirected_to invitation_path(invitation.token)
    follow_redirect!
    assert_redirected_to map_path(@map)
    assert_equal "editor", @map.role_for(@bob)
    assert invitation.reload.accepted?
  end

  test "return_to survives the session: sign-in redirects to the stored invitation url" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", invited_by: @owner)
    get invitation_url(invitation.token)
    stored = session[:return_to_after_authenticating]
    assert_equal invitation_url(invitation.token), stored
  end

  test "signed-in user accepts an invitation and lands on the map" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "viewer", invited_by: @owner)
    sign_in_as @bob
    get invitation_path(invitation.token)
    assert_redirected_to map_path(@map)
    assert_equal "viewer", @map.role_for(@bob)
  end

  test "an accepted invitation is single use, but its user can reopen it" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "viewer", invited_by: @owner)
    invitation.accept!(@bob)

    sign_in_as @bob
    get invitation_path(invitation.token)
    assert_redirected_to map_path(@map)

    carol = make_user("Carol")
    sign_in_as carol
    get invitation_path(invitation.token), headers: inertia_headers
    assert_response :gone
    assert_equal "used", response.parsed_body["props"]["state"]
    assert_nil @map.role_for(carol)
  end

  test "expired and unknown invitations" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", invited_by: @owner)
    sign_in_as @bob
    travel_to 31.days.from_now do
      get invitation_path(invitation.token), headers: inertia_headers
      assert_response :gone
      assert_equal "expired", response.parsed_body["props"]["state"]
    end
    get invitation_path("nope"), headers: inertia_headers
    assert_response :not_found
  end

  test "an editor invitation on a map that filled up explains the situation and stays open" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "editor", invited_by: @owner)
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    sign_in_as @bob
    get invitation_path(invitation.token), headers: inertia_headers
    assert_response :conflict
    assert_equal "editor_limit", response.parsed_body["props"]["state"]
    assert_nil @map.role_for(@bob)
    assert_not invitation.reload.accepted?
  end

  test "share link: join as the link's role" do
    link = @map.create_share_link!(role: "viewer", created_by: @owner)
    get join_path(link.token)
    assert_redirected_to new_session_path

    sign_in_as @bob
    get join_path(link.token)
    assert_redirected_to map_path(@map)
    assert_equal "viewer", @map.role_for(@bob)
  end

  test "disabled or reset share links do not work" do
    link = @map.create_share_link!(role: "viewer", created_by: @owner)
    old_token = link.token
    link.reset!
    sign_in_as @bob
    get join_path(old_token), headers: inertia_headers
    assert_response :not_found

    link.disable!
    get join_path(link.token), headers: inertia_headers
    assert_response :gone
    assert_equal "disabled", response.parsed_body["props"]["state"]
    assert_nil @map.role_for(@bob)
  end

  test "an existing viewer opening an editor link is upgraded when a seat is free" do
    link = @map.create_share_link!(role: "editor", created_by: @owner)
    sign_in_as users(:alice)
    get join_path(link.token)
    assert_equal "editor", @map.role_for(users(:alice))
  end
end
