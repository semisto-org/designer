require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

# « Le lieu et ses plantes » in the « Partager » dialog: the map's owner says
# who owns the place; only those people choose what other gardeners see.
class Maps::PlaceSharingControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @alice = users(:alice)
    @membership = @map.memberships.find_by(user: @alice)
  end

  test "the map's owner marks a member as an owner of the place; a member cannot" do
    sign_in_as @alice
    patch map_membership_path(@map, @membership), params: { membership: { place_owner: true } }, as: :json
    assert_response :forbidden

    sign_in_as @owner
    patch map_membership_path(@map, @membership), params: { membership: { place_owner: true } }, as: :json
    assert_response :success
    assert @membership.reload.place_owner
    assert_equal "viewer", @membership.role, "the role does not change"
    assert_equal [ "Alice" ], json["place"]["owners"]
    assert_equal true, json["members"].find { _1["userId"] == @alice.id }["placeOwner"]
  end

  test "only an owner of the place shares its plants, not even the map's owner" do
    @membership.update!(place_owner: true)
    sign_in_as @owner
    patch map_place_sharing_path(@map), params: { place_sharing: { shares_planted_palette: true } }, as: :json
    assert_response :forbidden
    assert_not @map.reload.shares_planted_palette

    sign_in_as @alice
    patch map_place_sharing_path(@map), params: { place_sharing: { shares_planted_palette: true, accepts_propagation_requests: true } }, as: :json
    assert_response :success
    assert @map.reload.shares_planted_palette
    assert @map.accepts_propagation_requests
    assert json["place"]["you"]
    assert_equal 0, json["place"]["pendingRequests"]
  end

  test "removing the last owner of the place stops the sharing" do
    @membership.update!(place_owner: true)
    @map.update!(shares_planted_palette: true, accepts_propagation_requests: true)
    sign_in_as @owner
    delete map_membership_path(@map, @membership), as: :json
    assert_response :success
    assert_not @map.reload.shares_planted_palette
    assert_not @map.accepts_propagation_requests
  end

  test "an invitee marked as an owner of the place becomes one on joining" do
    sign_in_as @owner
    post map_invitations_path(@map), params: { invitation: { email_address: "carole@example.org", role: "viewer", place_owner: true } }, as: :json
    assert_response :created
    invitation = @map.invitations.find_by(email_address: "carole@example.org")
    assert invitation.place_owner
    assert_equal true, json["invitations"].sole["placeOwner"]

    patch map_invitation_path(@map, invitation), params: { invitation: { place_owner: false } }, as: :json
    assert_not invitation.reload.place_owner
    invitation.update!(place_owner: true)

    carole = make_user("Carole", email: "carole@example.org")
    invitation.accept!(carole)
    assert @map.place_owner?(carole)
  end
end
