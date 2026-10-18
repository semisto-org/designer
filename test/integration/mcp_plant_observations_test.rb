require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads and adds to the journal of each planted plant, directly,
# like the harvest log: dated entries that never rewrite the earlier ones.
class McpPlantObservationsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @apples = [ 7, 9 ].map do |number|
      @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", geometry: point,
                            properties: { "species_id" => plant_species(:apple).id, "number" => number,
                                          "planted_on" => "2026-10-01", "planted_on_precision" => "unknown" })
    end
    @to_plant = @map.features.create!(layer: "plants", kind: "plant", name: "Poirier", geometry: point,
                                      properties: { "species_id" => plant_species(:apple).id, "number" => 12 })
  end

  test "record_plant_observations adds dated entries, list_plant_observations and get_feature read them back with the state" do
    data, error = call_tool(@owner, "record_plant_observations", { map_id: @map.id, entries: [
      { numbers: [ "7", "9" ], observed_on: "2026-04-03", kind: "flowering", note: "Pleine floraison" },
      { numbers: [ "7" ], observed_on: "2026-05-01", kind: "follow_up", survival: "established", vigor: 4 },
      { feature_ids: [ @apples.last.id ], observed_on: "2026-09-20", kind: "follow_up", survival: "struggling", note: "Inquiétant : feuilles tachées" },
      { feature_ids: [ @apples.last.id ], observed_on: "2026-09-20", kind: "disease", note: "Tavelure" },
      { numbers: [ "7" ], observed_on: "2026-06-01", kind: "follow_up" },
      { numbers: [ "12" ], observed_on: "2026-06-01", kind: "pruning", note: "Gourmands" }
    ] })
    refute error, data
    assert_equal 5, data["created"].size, data["rejected"].inspect
    assert_equal [ 4, 5 ], data["rejected"].map { _1["index"] }
    assert_match "Reprise", data["rejected"].first["error"]
    assert_match "pas encore planté", data["rejected"].last["error"]
    assert_equal users(:michael), PlantObservation.last.user
    assert_equal({ "created" => 5, "rejected" => 2 }, AiAction.last.result)

    data, error = call_tool(@viewer, "list_plant_observations", { map_id: @map.id, numbers: [ "9" ] })
    refute error, data
    assert_equal %w[follow_up disease flowering].sort, data["entries"].map { _1["kind"] }.sort
    assert_equal "n° 9 — Pommier", data["entries"].first["plant"]
    assert_equal [ { "featureId" => @apples.last.id, "survival" => "struggling", "vigor" => nil, "observedOn" => "2026-09-20" } ], data["states"]

    data, = call_tool(@viewer, "list_plant_observations", { map_id: @map.id, kind: "flowering" })
    assert_equal 2, data["entries"].size

    data, = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: @apples.first.id })
    assert_equal 2, data["journal_total"]
    assert_equal({ "survival" => "established", "vigor" => 4, "observed_on" => "2026-05-01" }, data["state"])
  end

  test "a pruning note does not hide the plant's take from the species sheet and the palette" do
    plant = @apples.first
    plant.plant_observations.create!(observed_on: "2026-05-01", kind: "follow_up", survival: "dead", user: users(:michael))
    plant.plant_observations.create!(observed_on: "2026-06-01", kind: "pruning", note: "Bois mort retiré", user: users(:michael))
    assert_equal [ "dead" ], PlantObservation.latest_per_plant.where(map_feature_id: plant.id).pluck(:survival)
    assert_equal 1, PlantObservation.stats_for(plant_species(:apple))[:dead]
  end

  test "a viewer cannot write" do
    _, error = call_tool(@viewer, "record_plant_observations", { map_id: @map.id, entries: [ { numbers: [ "7" ], observed_on: "2026-10-12", kind: "pruning" } ] })
    assert error
    assert_equal 0, PlantObservation.count
  end
end
