require "test_helper"
require "test_helpers/mcp_test_helper"

class McpImplementationTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.features.delete_all
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @apple = @map.features.create!(layer: "plants", kind: "plant", geometry: { type: "Point", coordinates: [ 4.905, 50.34 ] },
                                   properties: { "species_id" => plant_species(:apple).id })
    @pipe = @map.features.create!(layer: "networks", kind: "water_pipe", properties: { "planned" => true },
                                  geometry: { type: "LineString", coordinates: [ [ 4.904, 50.3401 ], [ 4.906, 50.3401 ] ] })
  end

  test "get_implementation_plan reads the phases and what is in none, networks for editors only" do
    phase = @map.implementation_phases.create!(name: "Premier hiver", starts_on: "2026-11-01", ends_on: "2027-03-31")
    @apple.update!(properties: @apple.properties.merge("phase_id" => phase.id))
    data, error = call_tool(@owner, "get_implementation_plan", { map_id: @map.id })
    refute error
    assert_equal "Premier hiver", data["phases"].sole["name"]
    assert_equal [ @apple.id ], data["phases"].sole["groups"].sole["feature_ids"]
    assert_equal [ "water_pipe" ], data["not_in_a_phase"].map { _1["kind"] }

    data, = call_tool(@viewer, "get_implementation_plan", { map_id: @map.id })
    assert_empty data["not_in_a_phase"], "networks are hidden from viewers"
  end

  test "propose_phases leaves drafts that a human accepts with their elements" do
    data, error = call_tool(@owner, "propose_phases", { map_id: @map.id, phases: [
      { name: "Premier hiver", starts_on: "2026-11-01", ends_on: "2027-03-31", rationale: "Les fruitiers à racines nues se plantent en hiver.", feature_ids: [ @apple.id, 999_999 ] },
      { name: "À l'envers", starts_on: "2027-03-01", ends_on: "2027-01-01", rationale: "Des dates dans le mauvais ordre." }
    ] })
    refute error
    assert_equal 1, data["created"].size
    assert_equal [ 999_999 ], data["created"].sole["unknown_ids"]
    assert_equal 1, data["rejected"].size
    draft = @map.implementation_phases.drafts.sole
    assert_equal "ai", draft.source
    assert_nil @apple.reload.properties["phase_id"], "nothing changes before a human accepts"

    sign_in_as users(:michael)
    post accept_map_implementation_phase_path(@map, draft), as: :json
    assert_response :success
    assert_equal draft.id, @apple.reload.properties["phase_id"]
    assert_equal "active", draft.reload.status
  end

  test "a viewer cannot propose phases" do
    _, error = call_tool(@viewer, "propose_phases", { map_id: @map.id, phases: [ { name: "X", starts_on: "2026-11-01", ends_on: "2027-03-31", rationale: "Une raison assez longue." } ] })
    assert error
    assert_empty @map.implementation_phases
  end
end
