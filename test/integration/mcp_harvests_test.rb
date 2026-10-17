require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads the harvest log and notes what the person saw or
# picked, directly, like the team's tasks.
class McpHarvestsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    # A plan numbered before Terranova keeps « n° 9.1 » in the name; the
    # number property is always a whole number.
    @apples = [ [ "7", 7 ], [ "9.1", 40 ] ].map do |label, number|
      @map.features.create!(layer: "plants", kind: "plant", name: "n° #{label} — Pommier", geometry: point,
                            properties: { "species_id" => plant_species(:apple).id, "number" => number, "planted_on" => "2015-03-01" })
    end
  end

  test "record_harvests notes lines by plan number or id, and list_harvests reads them back" do
    data, error = call_tool(@owner, "record_harvests", { map_id: @map.id, lines: [
      { numbers: [ "7", "n° 9.1" ], noted_on: "2026-10-12", stage: "picked", uses: [ "juice" ] },
      { feature_ids: [ @apples.first.id ], noted_on: "2026-07-01", stage: "on_tree", amount: "heavy" },
      { numbers: [ "99" ], noted_on: "2026-10-12", stage: "picked" }
    ] })
    refute error, data
    assert_equal 3, data["created"].size, data["rejected"].inspect
    assert_equal 2, data["rejected"].sole["index"]
    assert_match "n° 99", data["rejected"].sole["error"]
    assert_equal users(:michael), PlantHarvest.last.user
    assert_equal({ "created" => 3, "rejected" => 1 }, AiAction.last.result)

    data, error = call_tool(@viewer, "list_harvests", { map_id: @map.id, season: 2026 })
    refute error
    row = data["plants"].find { _1["featureId"] == @apples.first.id }
    assert_equal "picked", row["seasons"]["2026"]["status"]
    assert_equal "heavy", row["seasons"]["2026"]["amount"]
    assert_equal 3, data["lines"].size
    assert_equal PlantHarvest::USES, data["vocabulary"]["uses"]
  end

  test "a viewer cannot write, and a line with nothing valid writes nothing" do
    _, error = call_tool(@viewer, "record_harvests", { map_id: @map.id, lines: [ { numbers: [ "7" ], noted_on: "2026-10-12", stage: "picked" } ] })
    assert error
    _, error = call_tool(@owner, "record_harvests", { map_id: @map.id, lines: [ { numbers: [ "7" ], noted_on: "2026-10-12", stage: "on_tree" } ] })
    assert error
    assert_equal 0, PlantHarvest.count
  end
end
