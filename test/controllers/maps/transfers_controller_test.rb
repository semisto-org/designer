require "test_helper"
require_relative "../../test_helpers/collab_test_helper"
require_relative "../../test_helpers/teams_test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Maps::TransfersControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper
  include BillingTestHelper

  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @viewer = users(:alice)
    @lea = add_member(@map, make_user("Léa"), "editor")
  end

  def props = response.parsed_body["props"]
  def propose = MapTransfer.propose!(map: @map, from: @owner, to: @lea)

  test "the owner sees who can receive the map: editors, then the team's members" do
    bob = users(:bob)
    @map.update!(organization: make_team("Semisto", admin: @owner, members: [ bob ]))
    sign_in_as @owner
    get map_transfers_path(@map), as: :json
    assert_response :success
    assert_equal "owner", json["role"]
    assert_nil json["pending"]
    assert_equal [ [ "Léa", false ], [ "Bob", true ] ], json["candidates"].map { |c| [ c["name"], c["viaTeam"] ] }
    assert_equal @lea.email_address, json["candidates"].first["email"]
    assert_nil json["candidates"].last["email"], "a team's addresses stay with its admins"
    assert_equal 2, json["seatsLeft"]
    assert_equal 1, json["viewersCount"]
    assert_equal "Semisto", json["team"]
    assert_equal 14, json["expiresInDays"]
  end

  test "other participants only learn about a proposal made to them; outsiders get a 404" do
    transfer = propose
    sign_in_as @lea
    get map_transfers_path(@map), as: :json
    assert_equal "editor", json["role"]
    assert_equal transfer.id, json["incoming"]["id"]
    assert_equal "Michael", json["incoming"]["fromName"]
    assert_equal "/maps/#{@map.id}/transfers/#{transfer.id}", json["incoming"]["path"]
    assert_nil json["candidates"]

    sign_in_as @viewer
    get map_transfers_path(@map), as: :json
    assert_nil json["incoming"]
    assert_nil json["pending"]

    sign_in_as users(:bob)
    get map_transfers_path(@map), as: :json
    assert_response :not_found
  end

  test "the owner proposes: the recipient is mailed, the section shows the pending proposal" do
    sign_in_as @owner
    assert_enqueued_emails 1 do
      post map_transfers_path(@map), params: { transfer: { recipient_id: @lea.id } }, as: :json
    end
    assert_response :created
    assert_equal @lea.id, json["pending"]["recipient"]["userId"]
    assert_nil json["pending"]["problem"]
    assert @map.transfers.pending.exists?(to_user: @lea)
  end

  test "only the owner proposes: editors and viewers are refused, outsiders get a 404" do
    [ @lea, @viewer ].each do |user|
      sign_in_as user
      post map_transfers_path(@map), params: { transfer: { recipient_id: @lea.id } }, as: :json
      assert_response :forbidden
      assert_equal I18n.t("maps.errors.owner_only"), json["message"]
    end
    sign_in_as users(:bob)
    post map_transfers_path(@map), params: { transfer: { recipient_id: @lea.id } }, as: :json
    assert_response :not_found
    assert_empty @map.transfers
  end

  test "proposing to a viewer or to a stranger is refused with a clear message" do
    sign_in_as @owner
    post map_transfers_path(@map), params: { transfer: { recipient_id: @viewer.id } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Alice doit d'abord être éditeur de la carte/, json["message"])

    post map_transfers_path(@map), params: { transfer: { recipient_id: users(:bob).id } }, as: :json
    assert_response :unprocessable_entity
    assert_equal I18n.t("transfer.errors.recipient_missing"), json["message"], "no name leaks for a stranger's id"

    propose
    post map_transfers_path(@map), params: { transfer: { recipient_id: add_member(@map, make_user("Paul"), "editor").id } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/attend déjà une réponse/, json["message"])
  end

  test "the owner cancels the proposal; the recipient cannot" do
    transfer = propose
    sign_in_as @lea
    delete map_transfer_path(@map, transfer), as: :json
    assert_response :forbidden
    assert transfer.reload.pending?

    sign_in_as @owner
    delete map_transfer_path(@map, transfer), as: :json
    assert_response :success
    assert_nil json["pending"]
    assert_equal "canceled", transfer.reload.state

    delete map_transfer_path(@map, transfer), as: :json
    assert_response :unprocessable_entity
    assert_match(/déjà été annulée/, json["message"])
  end

  test "the recipient's screen shows the proposal and the plan impact" do
    transfer = propose
    sign_in_as @lea
    get map_transfer_path(@map, transfer), headers: inertia_headers
    assert_response :success
    assert_equal "maps/transfers/show", response.parsed_body["component"]
    assert_equal "pending", props["transfer"]["state"]
    assert_equal "Michael", props["transfer"]["fromName"]
    assert_nil props["transfer"]["problem"]
    assert_equal({ "id" => @map.id, "name" => @map.name, "canOpen" => true }, props["map"].slice("id", "name", "canOpen"))
    assert_equal false, props["impact"]["billing"]
  end

  test "the plan impact is computed for the recipient when billing is on" do
    Map.create!(name: "Potager", owner: @lea, region: regions(:wallonia), created_at: 10.years.ago)
    transfer = propose
    sign_in_as @lea
    with_billing do
      get map_transfer_path(@map, transfer), headers: inertia_headers
    end
    assert_equal true, props["impact"]["billing"]
    assert_equal "free", props["impact"]["plan"]
    assert_equal true, props["impact"]["mapReadOnly"]
  end

  test "only the recipient opens the screen: others get the forbidden response, outsiders a 404" do
    transfer = propose
    sign_in_as @owner
    get map_transfer_path(@map, transfer)
    assert_redirected_to map_path(@map)
    assert_equal I18n.t("transfer.errors.recipient_only"), flash[:alert]

    sign_in_as @viewer
    post accept_map_transfer_path(@map, transfer), as: :json
    assert_response :forbidden
    post decline_map_transfer_path(@map, transfer), as: :json
    assert_response :forbidden

    sign_in_as users(:bob)
    get map_transfer_path(@map, transfer)
    assert_response :not_found
    post accept_map_transfer_path(@map, transfer), as: :json
    assert_response :not_found
    assert transfer.reload.pending?
  end

  test "the recipient accepts: owner of the map, the former owner stays editor and is mailed" do
    transfer = propose
    sign_in_as @lea
    assert_enqueued_email_with MapTransferMailer, :accepted, args: [ transfer ] do
      post accept_map_transfer_path(@map, transfer), headers: inertia_headers
    end
    assert_redirected_to map_path(@map)
    assert_equal I18n.t("transfer.flash.accepted", map: @map.name), flash[:notice]
    assert_equal @lea, @map.reload.owner
    assert_equal "editor", @map.role_for(@owner)

    # The new owner manages the map; the former one no longer does.
    get map_transfers_path(@map), as: :json
    assert_equal "owner", json["role"]
    sign_in_as @owner
    get map_sharing_path(@map), as: :json
    assert_equal "editor", json["role"]
  end

  test "acceptance after the roles changed is refused cleanly" do
    transfer = propose
    @map.memberships.find_by(user: @lea).update!(role: "viewer")
    sign_in_as @lea
    post accept_map_transfer_path(@map, transfer), as: :json
    assert_response :unprocessable_entity
    assert_equal "not_editor", json["reason"]
    assert_match(/plus éditeur/, json["message"])

    post accept_map_transfer_path(@map, transfer), headers: inertia_headers
    assert_redirected_to map_transfer_path(@map, transfer)
    assert_equal @owner, @map.reload.owner
    assert_equal "invalidated", transfer.reload.state
  end

  test "a recipient who lost access still sees what became of the proposal" do
    transfer = propose
    @map.memberships.find_by(user: @lea).destroy!
    sign_in_as @lea
    get map_transfer_path(@map, transfer), headers: inertia_headers
    assert_response :success
    assert_equal({ "id" => @map.id, "name" => @map.name, "canOpen" => false }, props["map"])
    assert_match(/plus éditeur/, props["transfer"]["problem"])
    assert_nil props["impact"]

    post accept_map_transfer_path(@map, transfer), as: :json
    assert_response :unprocessable_entity
    assert_equal @owner, @map.reload.owner
  end

  test "the recipient declines: the owner is mailed, the map does not move" do
    transfer = propose
    sign_in_as @lea
    assert_enqueued_email_with MapTransferMailer, :declined, args: [ transfer ] do
      post decline_map_transfer_path(@map, transfer), headers: inertia_headers
    end
    assert_redirected_to map_path(@map)
    assert_equal "declined", transfer.reload.state
    assert_equal @owner, @map.reload.owner

    get map_transfer_path(@map, transfer), headers: inertia_headers
    assert_equal "declined", props["transfer"]["state"]
    assert_nil props["impact"]
  end

  test "the maps list shows the proposals waiting for my answer" do
    transfer = propose
    sign_in_as @lea
    get maps_path, headers: inertia_headers
    assert_equal [ transfer.id ], props["incomingTransfers"].map { |t| t["id"] }
    assert_equal @map.name, props["incomingTransfers"].first["mapName"]

    sign_in_as @owner
    get maps_path, headers: inertia_headers
    assert_empty props["incomingTransfers"]
  end

  test "after a transfer the map editor, the public view and the plan badge follow the new owner" do
    publication = MapPublication.publish!(@map, by: @owner, title: "Le projet")
    propose.accept!(by: @lea)

    sign_in_as @owner
    get map_path(@map), headers: inertia_headers
    assert_response :success
    assert_equal "editor", props["map"]["role"]
    assert_equal "Léa", props["map"]["ownerName"]
    assert_equal false, props["map"]["readOnlyByPlan"]

    sign_out
    get public_map_path(publication.token)
    assert_response :success
  end
end
