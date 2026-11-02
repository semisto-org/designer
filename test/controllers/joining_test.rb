require "test_helper"
require_relative "../test_helpers/collab_test_helper"

# The accept flows: e-mail invitation (/invitations/:token) and share link (/join/:token).
class JoiningTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @bob = users(:bob)
  end

  test "signed-out visitor first sees the place, then signs in, lands back on the invitation and joins" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "editor", invited_by: @owner)
    get invitation_path(invitation.token), headers: inertia_headers
    assert_response :success
    page = JSON.parse(response.body)
    assert_equal "invitations/welcome", page["component"]
    welcome = page["props"]["invitation"]
    assert_equal @map.name, welcome["mapName"]
    assert_equal @owner.display_name, welcome["inviterName"]
    assert_equal "editor", welcome["role"]
    assert welcome["chat"], "an editor is always in the discussion"
    assert_equal @map.created_at.to_date.iso8601, welcome["since"]
    assert_equal new_session_path, page["props"]["signInPath"]
    # Never the address or the parcels before signing in.
    assert_not welcome.key?("address")
    assert_not welcome.key?("parcels")

    # Signing in (the magic link carries return_to) brings them back to the invitation.
    post magic_link_path(@bob.generate_token_for(:magic_link), return_to: invitation_path(invitation.token))
    assert_redirected_to invitation_path(invitation.token)
    follow_redirect!
    assert_redirected_to map_path(@map)
    assert_equal "editor", @map.role_for(@bob)
    assert invitation.reload.accepted?

    # The map greets them once, by who invited them, instead of the carnet de route.
    get map_path(@map), headers: inertia_headers
    welcome = JSON.parse(response.body)["props"]["welcome"]
    assert_equal @owner.display_name, welcome["inviterName"]
    assert_equal "editor", welcome["role"]
    get map_path(@map), headers: inertia_headers
    assert_nil JSON.parse(response.body)["props"]["welcome"]
  end

  test "a viewer invited into the discussion is told so" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "viewer", chat_access: true, invited_by: @owner)
    get invitation_path(invitation.token), headers: inertia_headers
    assert JSON.parse(response.body)["props"]["invitation"]["chat"]
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

  test "an editor invitation on a map that already has three editors still joins" do
    invitation = @map.invitations.create!(email_address: "bob@example.org", role: "editor", invited_by: @owner)
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    sign_in_as @bob
    get invitation_path(invitation.token)
    assert_redirected_to map_path(@map)
    assert_equal "editor", @map.role_for(@bob)
    assert invitation.reload.accepted?
    assert_equal 4, @map.editors_count
  end

  test "an editor share link lets a fourth and a fifth editor join" do
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    link = @map.create_share_link!(role: "editor", created_by: @owner)
    [ @bob, make_user("Fifth") ].each do |user|
      sign_in_as user
      get join_path(link.token)
      assert_redirected_to map_path(@map)
      assert_equal "editor", @map.role_for(user)
    end
    assert_equal 5, @map.editors_count
  end

  test "share link: join as the link's role" do
    link = @map.create_share_link!(role: "viewer", created_by: @owner)
    get join_path(link.token), headers: inertia_headers
    page = JSON.parse(response.body)
    assert_equal "invitations/welcome", page["component"]
    assert_equal "viewer", page["props"]["invitation"]["role"]
    assert_not page["props"]["invitation"]["chat"]

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

  test "an existing viewer opening an editor link is upgraded" do
    link = @map.create_share_link!(role: "editor", created_by: @owner)
    sign_in_as users(:alice)
    get join_path(link.token)
    assert_equal "editor", @map.role_for(users(:alice))
  end
end
