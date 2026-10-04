require "test_helper"
require_relative "../../test_helpers/plantnet_test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PlantIdentificationsControllerTest < ActionDispatch::IntegrationTest
  include PlantnetTestHelper
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @photos = [ upload("terrain.jpg"), upload("plant.png") ]
  end

  def identify(images = @photos, **) = post(map_plant_identifications_path(@map), params: { images: }, headers: json_headers, **)

  test "an editor gets the candidates with their score and their catalogue species" do
    stub = stub_plantnet
    sign_in_as users(:michael)
    with_plantnet_key do
      identify
    end

    assert_response :success
    assert_requested stub
    assert_requested(:post, PLANTNET_ENDPOINT) { |request| request.body.include?('filename="terrain.jpg"') && request.body.include?('filename="plant.png"') }
    body = response.parsed_body
    assert body["available"]
    assert_equal "Pl@ntNet", body["credit"]
    apple, oak = body["candidates"]
    assert_equal "Malus domestica", apple["latinName"]
    assert_equal 83, apple["percent"]
    assert_equal 0.83, apple["score"]
    assert_equal [ "Pommier", "Pommier domestique" ], apple["commonNames"]
    assert_equal plant_species(:apple).id, apple.dig("species", "id")
    assert_equal "Pommier", apple.dig("species", "commonName")
    assert_equal "Quercus robur", oak["latinName"]
    assert_nil oak["species"]
  end

  test "an editor of the map (not its owner) can identify too" do
    stub_plantnet
    @map.memberships.create!(user: users(:bob), role: "editor")
    sign_in_as users(:bob)
    with_plantnet_key { identify }
    assert_response :success
  end

  test "nothing is saved: no photo, no feature, no species" do
    stub_plantnet
    sign_in_as users(:michael)
    assert_no_difference [ -> { ActiveStorage::Blob.count }, -> { @map.features.count }, -> { MapPhoto.count } ] do
      with_plantnet_key { identify }
    end
  end

  test "a plant Pl@ntNet does not see gives an empty list, not an error" do
    stub_plantnet(status: 404, body: { message: "Species not found" }.to_json)
    sign_in_as users(:michael)
    with_plantnet_key { identify }
    assert_response :success
    assert_equal [], response.parsed_body["candidates"]
  end

  test "a viewer is refused and Pl@ntNet is never called" do
    sign_in_as users(:alice)
    with_plantnet_key { identify }
    assert_response :forbidden
    assert_not_requested :any, //
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    with_plantnet_key { identify }
    assert_response :not_found
    assert_not_requested :any, //
  end

  test "requires sign in" do
    with_plantnet_key { identify }
    assert_redirected_to new_session_path
    assert_not_requested :any, //
  end

  test "without a key the answer is a clear state, and nothing is sent" do
    sign_in_as users(:michael)
    identify
    assert_response :service_unavailable
    body = response.parsed_body
    assert_equal false, body["available"]
    assert_equal "not_configured", body["code"]
    assert_equal "L'identification par photo n'est pas activée sur ce serveur.", body["message"]
    assert_not_requested :any, //
  end

  test "no photo is a 422 with a French message" do
    sign_in_as users(:michael)
    with_plantnet_key { post map_plant_identifications_path(@map), headers: json_headers }
    assert_response :unprocessable_entity
    assert_equal "invalid", response.parsed_body["code"]
    assert_equal "Choisis au moins une photo de la plante.", response.parsed_body["message"]

    with_plantnet_key { post map_plant_identifications_path(@map), params: { images: "not-a-file" }, headers: json_headers }
    assert_response :unprocessable_entity
    assert_not_requested :any, //
  end

  test "more than five photos is a 422" do
    sign_in_as users(:michael)
    with_plantnet_key { identify([ upload("terrain.jpg") ] * 6) }
    assert_response :unprocessable_entity
    assert_equal "5 photos au plus, toutes de la même plante.", response.parsed_body["message"]
    assert_not_requested :any, //
  end

  test "a file that is not a photo is a 422" do
    sign_in_as users(:michael)
    with_plantnet_key { identify([ upload("rapport_labo.pdf") ]) }
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["message"], "n'est pas une photo JPEG ou PNG"
    assert_not_requested :any, //
  end

  test "an upstream error is a friendly 503, never a 500, and the key is not leaked" do
    stub_plantnet(status: 500, body: "boom")
    sign_in_as users(:michael)
    with_plantnet_key("secret-key-123") { identify }
    assert_response :service_unavailable
    body = response.parsed_body
    assert_equal true, body["available"]
    assert_equal "unavailable", body["code"]
    assert_includes body["message"], "Pl@ntNet ne répond pas pour le moment"
    assert_not_includes response.body, "secret-key-123"
  end

  test "a timeout is the same friendly 503" do
    stub_request(:post, PLANTNET_ENDPOINT).to_timeout
    sign_in_as users(:michael)
    with_plantnet_key { identify }
    assert_response :service_unavailable
    assert_equal "unavailable", response.parsed_body["code"]
  end

  test "a reached quota says so" do
    stub_plantnet(status: 429, body: "Too many requests")
    sign_in_as users(:michael)
    with_plantnet_key { identify }
    assert_response :service_unavailable
    assert_equal "quota", response.parsed_body["code"]
    assert_includes response.parsed_body["message"], "limite"
  end

  test "an unreadable answer is a friendly 503 too" do
    stub_plantnet(body: "<html>gateway</html>")
    sign_in_as users(:michael)
    with_plantnet_key { identify }
    assert_response :service_unavailable
    assert_equal "unavailable", response.parsed_body["code"]
  end

  test "the editor learns from the shared props whether Pl@ntNet is configured" do
    sign_in_as users(:michael)
    get map_path(@map), headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "env", "plantnet")

    with_plantnet_key do
      get map_path(@map), headers: inertia_headers
      assert_equal true, response.parsed_body.dig("props", "env", "plantnet")
    end
  end
end
