require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class Maps::SharingControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @viewer = users(:alice)
  end

  test "any member sees who is on the map, only the owner sees e-mails, invitations and the link" do
    sign_in_as @viewer
    get map_sharing_path(@map), as: :json
    assert_response :success
    assert_equal %w[owner viewer], json["members"].map { |m| m["role"] }
    assert json["members"].all? { |m| m["email"].nil? }
    assert_nil json["invitations"]
    assert_nil json["link"]

    sign_in_as @owner
    get map_sharing_path(@map), as: :json
    assert_includes json["members"].map { |m| m["email"] }, @viewer.email_address
    assert_equal [], json["invitations"]
    assert_equal false, json["link"]["enabled"]
  end

  test "outsiders get a 404" do
    sign_in_as users(:bob)
    get map_sharing_path(@map), as: :json
    assert_response :not_found
  end

  test "owner changes a role; editors and viewers cannot" do
    membership = @map.memberships.find_by(user: @viewer)
    sign_in_as @viewer
    patch map_membership_path(@map, membership), params: { membership: { role: "editor" } }, as: :json
    assert_response :forbidden
    assert_equal "viewer", membership.reload.role

    sign_in_as @owner
    patch map_membership_path(@map, membership), params: { membership: { role: "editor" } }, as: :json
    assert_response :success
    assert_equal "editor", membership.reload.role
    patch map_membership_path(@map, membership), params: { membership: { role: "owner" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "owner cannot make a fourth editor, the message is clear" do
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    membership = @map.memberships.find_by(user: @viewer)
    sign_in_as @owner
    patch map_membership_path(@map, membership), params: { membership: { role: "editor" } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/3 éditeurs/, json["message"])
    assert_equal "viewer", membership.reload.role
  end

  test "the owner role cannot be changed or removed" do
    owner_membership = @map.memberships.find_by(user: @owner)
    sign_in_as @owner
    patch map_membership_path(@map, owner_membership), params: { membership: { role: "viewer" } }, as: :json
    assert_response :unprocessable_entity
    delete map_membership_path(@map, owner_membership), as: :json
    assert_response :unprocessable_entity
    assert_equal "owner", @map.role_for(@owner)
  end

  test "owner removes a member" do
    membership = @map.memberships.find_by(user: @viewer)
    CommentSubscription.subscribe(@viewer, @map)
    sign_in_as @owner
    assert_difference -> { @map.memberships.count }, -1 do
      delete map_membership_path(@map, membership), as: :json
    end
    assert_response :success
    assert_nil @map.role_for(@viewer)
    assert_not CommentSubscription.subscribed?(@viewer, @map), "their thread subscriptions go with them"
  end

  test "a member leaves the map on their own; nobody else can remove them" do
    editor = add_member(@map, make_user("Edith"), "editor")
    other = @map.memberships.find_by(user: editor)
    sign_in_as @viewer
    delete map_membership_path(@map, other), as: :json
    assert_response :forbidden

    own = @map.memberships.find_by(user: @viewer)
    delete map_membership_path(@map, own), as: :json
    assert_response :success
    assert_equal true, json["left"]
    assert_nil @map.role_for(@viewer)
  end

  test "owner invites by e-mail: the mail is queued and the invitation listed" do
    sign_in_as @owner
    assert_enqueued_emails 1 do
      post map_invitations_path(@map), params: { invitation: { email_address: " Nouvelle@Example.org ", role: "viewer" } }, as: :json
    end
    assert_response :created
    assert_equal [ "nouvelle@example.org" ], json["invitations"].map { |i| i["email"] }
    invitation = @map.invitations.last
    assert_equal @owner, invitation.invited_by
    assert_not_nil invitation.last_sent_at
  end

  test "inviting the same address twice updates the role instead of duplicating" do
    sign_in_as @owner
    post map_invitations_path(@map), params: { invitation: { email_address: "x@example.org", role: "viewer" } }, as: :json
    assert_no_difference -> { @map.invitations.count } do
      post map_invitations_path(@map), params: { invitation: { email_address: "x@example.org", role: "editor" } }, as: :json
    end
    assert_equal "editor", @map.invitations.last.role
  end

  test "invitation errors are in French: editor limit, existing member, bad address" do
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    sign_in_as @owner
    post map_invitations_path(@map), params: { invitation: { email_address: "x@example.org", role: "editor" } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/3 éditeurs/, json["message"])
    post map_invitations_path(@map), params: { invitation: { email_address: @viewer.email_address, role: "viewer" } }, as: :json
    assert_equal "Cette personne a déjà accès à la carte.", json["message"]
    post map_invitations_path(@map), params: { invitation: { email_address: "pas-un-mail", role: "viewer" } }, as: :json
    assert_equal "Cette adresse e-mail ne semble pas valide.", json["message"]
  end

  test "only the owner invites" do
    editor = add_member(@map, make_user("Edith"), "editor")
    sign_in_as editor
    post map_invitations_path(@map), params: { invitation: { email_address: "x@example.org", role: "viewer" } }, as: :json
    assert_response :forbidden
  end

  test "owner resends and cancels an invitation" do
    invitation = @map.invitations.create!(email_address: "x@example.org", role: "viewer", invited_by: @owner)
    sign_in_as @owner
    assert_enqueued_emails 1 do
      post resend_map_invitation_path(@map, invitation), as: :json
    end
    assert_response :success
    delete map_invitation_path(@map, invitation), as: :json
    assert_response :success
    assert_not MapInvitation.exists?(invitation.id)
  end

  test "share link: enable, change role, reset, disable" do
    sign_in_as @owner
    post map_share_link_path(@map), params: { share_link: { role: "viewer" } }, as: :json
    assert_response :created
    assert json["link"]["enabled"]
    first_url = json["link"]["url"]
    assert_match %r{/join/}, first_url

    patch map_share_link_path(@map), params: { share_link: { role: "editor" } }, as: :json
    assert_equal "editor", json["link"]["role"]
    assert_not_equal first_url, json["link"]["url"], "a new role means a new link"

    url = json["link"]["url"]
    post reset_map_share_link_path(@map), as: :json
    assert_not_equal url, json["link"]["url"]

    delete map_share_link_path(@map), as: :json
    assert_equal false, json["link"]["enabled"]
    assert_nil json["link"]["url"]

    patch map_share_link_path(@map), params: { share_link: { role: "owner" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "non owners cannot touch the share link" do
    sign_in_as @viewer
    post map_share_link_path(@map), as: :json
    assert_response :forbidden
  end
end
