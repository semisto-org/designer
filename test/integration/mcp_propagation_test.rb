require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/propagation_test_helper"

# The user's AI reads who owns a place, where a species is in the ground in
# other gardens that show it, and the requests for scions, cuttings or seeds.
class McpPropagationTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @apple = plant_species(:apple)
    @reinette = plant_varieties(:reinette)
    plant_in_ground!(@map, @apple, variety: @reinette)
    @bob = gardener_with_map
  end

  test "get_map says who owns the place and what they share; only an owner sees the pending requests" do
    data, = call_tool(personal_token(users(:michael)), "get_map", { map_id: @map.id })
    assert_equal({ "owners" => [], "you" => false, "shares_planted_palette" => false, "accepts_propagation_requests" => false }, data["place"])

    share_place!
    PropagationRequest.create!(map: @map, species: @apple, variety: @reinette, requester: @bob, material: "scions", message: "Bonjour !")
    data, = call_tool(personal_token(users(:michael)), "get_map", { map_id: @map.id })
    assert_equal [ "Michael" ], data.dig("place", "owners").map { _1.split.first }
    assert data.dig("place", "you")
    assert data.dig("place", "shares_planted_palette")
    assert_equal 1, data.dig("place", "pending_requests")

    data, = call_tool(personal_token(users(:alice)), "get_map", { map_id: @map.id })
    refute data.dig("place", "you")
    refute data["place"].key?("pending_requests")
  end

  test "get_plant shows the gardens that show the species, never their map or people" do
    data, = call_tool(personal_token(@bob), "get_plant", { plant_id: @apple.id })
    assert_equal [], data["sharedGardens"]

    share_place!
    data, = call_tool(personal_token(@bob), "get_plant", { plant_id: @apple.id })
    place = data["sharedGardens"].sole
    assert_equal "Wallonie", place["region"]
    assert_equal "Jardin de Bob", place["nearMap"]
    assert_equal "Reinette grise", place["plants"].sole["variety"]
    refute_includes place.to_json, @map.name

    data, = call_tool(personal_token(users(:michael)), "get_plant", { plant_id: @apple.id })
    assert_equal [], data["sharedGardens"], "a map the person opens is not someone else's garden"
  end

  test "list_propagation_requests gives the places owned, the requests received and sent, e-mails only once accepted" do
    share_place!
    request = PropagationRequest.create!(map: @map, species: @apple, variety: @reinette, requester: @bob, material: "scions", message: "Bonjour !")

    data, error = call_tool(personal_token(users(:michael)), "list_propagation_requests")
    refute error
    assert_equal [ @map.id ], data["places"].map { _1["map_id"] }
    received = data["received"].sole
    assert_equal "pending", received["status"]
    assert received["can_answer"]
    refute received["requester"].key?("email")
    assert_equal [], data["sent"]

    data, = call_tool(personal_token(@bob), "list_propagation_requests", { box: "sent" })
    sent = data["sent"].sole
    assert_equal "Wallonie", sent["region"]
    refute_includes sent.to_json, @map.name
    assert_nil sent["owner"]

    request.accept!(users(:michael), answer: "Avec plaisir")
    data, = call_tool(personal_token(@bob), "list_propagation_requests", { box: "sent", status: "accepted" })
    assert_equal users(:michael).email_address, data["sent"].sole.dig("owner", "email")
    data, = call_tool(personal_token(users(:michael)), "list_propagation_requests", { box: "received" })
    assert_equal @bob.email_address, data["received"].sole.dig("requester", "email")
    data, = call_tool(personal_token(@bob), "list_propagation_requests", { status: "pending" })
    assert_equal [], data["sent"]
  end
end
