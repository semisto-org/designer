require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/propagation_test_helper"

class PropagationRequestsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @map = share_place!
    @apple = plant_species(:apple)
    @reinette = plant_varieties(:reinette)
    plant_in_ground!(@map, @apple, variety: @reinette)
    @bob = gardener_with_map
  end

  def ask!(user = @bob)
    sign_in_as user
    post propagation_requests_path, params: { propagation_request: { map_id: @map.id, species_id: @apple.id, variety_id: @reinette.id, material: "scions", message: "Bonjour !" } }, as: :json
  end

  test "the species sheet lists the shared place and a gardener sends a request" do
    sign_in_as @bob
    get plant_path(@apple), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ @map.id ], props["sharedPlantings"].map { _1["id"] }
    assert_includes props["materials"], "scions"

    assert_enqueued_emails 1 do
      ask!
    end
    assert_response :created
    request = PropagationRequest.last
    assert_equal [ @bob, @reinette, "pending" ], [ request.requester, request.variety, request.status ]
  end

  test "a place that is not shared cannot be asked" do
    @map.update!(shares_planted_palette: false)
    ask!
    assert_response :not_found
    assert_equal 0, PropagationRequest.count
  end

  test "an owner of the place answers; the requester then sees the owner's address, and the owner theirs" do
    ask!
    request = PropagationRequest.last

    sign_in_as users(:alice)
    patch propagation_request_path(request), params: { propagation_request: { decision: "accept" } }
    assert request.reload.pending?, "a viewer of the map is not an owner of the place"

    sign_in_as users(:michael)
    get propagation_requests_path, headers: inertia_headers
    received = response.parsed_body["props"]["received"].sole
    assert received["canAnswer"]
    assert_nil received["requester"]["email"], "no address before accepting"

    assert_enqueued_emails 1 do
      patch propagation_request_path(request), params: { propagation_request: { decision: "accept", answer: "Passe en février." } }
    end
    assert_redirected_to propagation_requests_path
    assert request.reload.accepted?

    get propagation_requests_path, headers: inertia_headers
    assert_equal @bob.email_address, response.parsed_body["props"]["received"].sole["requester"]["email"]

    sign_in_as @bob
    get propagation_requests_path, headers: inertia_headers
    sent = response.parsed_body["props"]["sent"].sole
    assert_equal users(:michael).email_address, sent["owner"]["email"]
    assert_equal "Passe en février.", sent["answer"]
  end

  test "the requester withdraws a pending request; nobody else can" do
    ask!
    request = PropagationRequest.last
    sign_in_as users(:michael)
    delete propagation_request_path(request)
    assert request.reload.pending?

    sign_in_as @bob
    delete propagation_request_path(request)
    assert_equal "withdrawn", request.reload.status
  end
end
