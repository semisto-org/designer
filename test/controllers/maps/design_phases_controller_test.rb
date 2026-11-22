require "test_helper"

class Maps::DesignPhasesControllerTest < ActionDispatch::IntegrationTest
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze

  setup do
    @map = maps(:ahinvaux)
    @pond = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
  end

  test "an editor puts the phase away, reads it back, renames it and takes an element back" do
    sign_in_as users(:michael)
    post map_design_phases_path(@map), params: { phase: { name: "Esquisse", next_name: "Avant-projet" } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal "Avant-projet", body["current"]
    assert_equal [ "Esquisse" ], body["phases"].map { _1["name"] }
    id = body["id"]

    @pond.trash!
    get map_design_phase_path(@map, id), as: :json
    assert_response :success
    assert_includes response.parsed_body.dig("snapshot", "features").map { _1["id"] }, @pond.id
    assert_equal [ @pond.id ], response.parsed_body.dig("compare", "removed")

    patch map_design_phase_path(@map, id), params: { phase: { name: "Esquisse d'octobre", notes: "Avec Eric" } }, as: :json
    assert_equal "Esquisse d'octobre", response.parsed_body["phases"].sole["name"]

    post take_map_design_phase_path(@map, id), params: { feature_id: @pond.id }, as: :json
    assert_response :created
    assert_equal "pond", response.parsed_body.dig("feature", "properties", "kind")

    patch map_current_design_phase_path(@map), params: { name: "Projet détaillé" }, as: :json
    assert_equal "Projet détaillé", response.parsed_body["current"]

    delete map_design_phase_path(@map, id), as: :json
    assert_response :success
    assert_empty response.parsed_body["phases"]
  end

  test "a viewer reads the phases but cannot put one away" do
    phase = MapPhase.put_away!(@map, name: "Esquisse")
    sign_in_as users(:alice)
    get map_design_phases_path(@map), as: :json
    assert_response :success
    assert_equal [ "Esquisse" ], response.parsed_body["phases"].map { _1["name"] }
    get map_design_phase_path(@map, phase), as: :json
    assert_response :success

    post map_design_phases_path(@map), params: { phase: { name: "Avant-projet" } }, as: :json
    assert_response :forbidden
    post take_map_design_phase_path(@map, phase), params: { feature_id: @pond.id }, as: :json
    assert_response :forbidden
  end
end
