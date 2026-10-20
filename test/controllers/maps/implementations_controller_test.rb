require "test_helper"

class Maps::ImplementationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.features.delete_all
    @apple = @map.features.create!(layer: "plants", kind: "plant", geometry: { type: "Point", coordinates: [ 4.905, 50.34 ] },
                                   properties: { "species_id" => plant_species(:apple).id })
  end

  test "the page shows the plan to everyone on the map" do
    sign_in_as users(:alice) # viewer
    get map_implementation_path(@map), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/implementations/show", page["component"]
    assert_equal 1, page["props"]["plan"]["totals"]["count"]
    assert_not page["props"]["canEdit"]
  end

  test "viewers cannot change the plan" do
    sign_in_as users(:alice)
    post proposal_map_implementation_path(@map), as: :json
    assert_response :forbidden
    post map_implementation_phases_path(@map), params: { phase: { name: "X", starts_on: "2026-11-01", ends_on: "2027-03-31" } }, as: :json
    assert_response :forbidden
  end

  test "an editor proposes a phasing, adds a phase and moves an element into it" do
    sign_in_as users(:michael)
    post proposal_map_implementation_path(@map), as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["assigned"]
    post map_implementation_phases_path(@map), params: { phase: { name: "Verger du bas", starts_on: "2027-11-01", ends_on: "2028-02-28" } }, as: :json
    assert_response :created
    phase_id = response.parsed_body["phase"]["id"]
    post assign_map_implementation_path(@map), params: { feature_ids: [ @apple.id ], phase_id: }, as: :json
    assert_response :success
    assert_equal phase_id, @apple.reload.properties["phase_id"]
    post assign_map_implementation_path(@map), params: { feature_ids: [ @apple.id ], phase_id: nil }, as: :json
    assert_nil @apple.reload.properties["phase_id"]
  end

  test "marks elements drawn as already there « En projet »" do
    sign_in_as users(:michael)
    hedge = @map.features.create!(layer: "structures", kind: "hedge", geometry: { type: "LineString", coordinates: [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] })
    post assign_map_implementation_path(@map), params: { feature_ids: [ hedge.id ], planned: true }, as: :json
    assert_response :success
    assert hedge.reload.properties["planned"]
    assert_empty response.parsed_body["plan"]["drawnAsExisting"]
  end

  test "phases are validated and their deletion frees the elements" do
    sign_in_as users(:michael)
    post map_implementation_phases_path(@map), params: { phase: { name: "À l'envers", starts_on: "2027-03-01", ends_on: "2027-01-01" } }, as: :json
    assert_response :unprocessable_entity
    phase = @map.implementation_phases.create!(name: "Hiver", starts_on: "2026-11-01", ends_on: "2027-03-31")
    @apple.update!(properties: @apple.properties.merge("phase_id" => phase.id))
    patch map_implementation_phase_path(@map, phase), params: { phase: { hours_override: 12, lock_version: 0 } }, as: :json
    assert_response :success
    assert_equal 12.0, response.parsed_body["plan"]["phases"].first["hours"]["total"]
    delete map_implementation_phase_path(@map, phase), as: :json
    assert_response :success
    assert_nil @apple.reload.properties["phase_id"]
  end
end
