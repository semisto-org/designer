require "test_helper"

class Maps::WaterSourcesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @well = @map.water_sources.create!(name: "Eau de puits", potable: true)
  end

  test "everyone on the map reads the sources" do
    sign_in_as users(:alice)
    get map_water_sources_path(@map), as: :json
    assert_response :success
    assert_equal [ { "id" => @well.id, "name" => "Eau de puits", "potable" => true, "notes" => nil, "tapCount" => 0 } ],
                 response.parsed_body["sources"]
  end

  test "viewers cannot change them" do
    sign_in_as users(:alice)
    post map_water_sources_path(@map), params: { water_source: { name: "Eau de pluie" } }, as: :json
    assert_response :forbidden
  end

  test "editors add a source" do
    sign_in_as users(:michael)
    post map_water_sources_path(@map), params: { water_source: { name: "Eau de pluie", potable: false, notes: "Citerne de 10 m³" } }, as: :json
    assert_response :created
    assert_equal [ "Eau de puits", "Eau de pluie" ], response.parsed_body["sources"].pluck("name")
    assert_equal "Citerne de 10 m³", response.parsed_body.dig("source", "notes")
  end

  test "a duplicate name is refused in French" do
    sign_in_as users(:michael)
    post map_water_sources_path(@map), params: { water_source: { name: "eau de puits" } }, as: :json
    assert_response :unprocessable_entity
    assert_equal "Nom de la source est déjà utilisé par une autre source de cette carte", response.parsed_body["message"]
  end

  test "changing the potability answers with the taps it changed" do
    sign_in_as users(:michael)
    tap = @map.features.create!(layer: "networks", kind: "tap", geometry: point, properties: { water_source_id: @well.id })
    patch map_water_source_path(@map, @well), params: { water_source: { potable: false } }, as: :json
    assert_response :success
    assert_equal [ tap.id ], response.parsed_body["features"].pluck("id")
    assert_equal false, response.parsed_body["features"].first.dig("properties", "potable")
    assert_equal 1, response.parsed_body.dig("source", "tapCount")
  end

  test "deleting a source unlinks its taps" do
    sign_in_as users(:michael)
    tap = @map.features.create!(layer: "networks", kind: "tap", geometry: point, properties: { water_source_id: @well.id })
    delete map_water_source_path(@map, @well), as: :json
    assert_response :success
    assert_empty response.parsed_body["sources"]
    assert_nil response.parsed_body["features"].first.dig("properties", "water_source_id")
    assert_not tap.reload.properties.key?("water_source_id")
  end

  test "a tap is linked through the features API" do
    sign_in_as users(:michael)
    post map_features_path(@map), params: { feature: { layer: "networks", kind: "tap", geometry: point, properties: { water_source_id: @well.id, potable: false } } }, as: :json
    assert_response :created
    assert_equal [ @well.id, true ], response.parsed_body["properties"].values_at("water_source_id", "potable")
  end

  test "another map's source cannot be reached" do
    sign_in_as users(:michael)
    other = Map.create!(name: "Ailleurs", owner: users(:alice))
    source = other.water_sources.create!(name: "Réseau")
    patch map_water_source_path(@map, source), params: { water_source: { name: "X" } }, as: :json
    assert_response :not_found
  end
end
