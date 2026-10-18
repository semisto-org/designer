require "test_helper"
require "test_helpers/mcp_test_helper"

# A task can be about plants or other elements of its map: the AI links them
# when it creates or changes a task, and finds the tasks of a plant.
class McpTaskFeaturesTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @apples = [ 7, 9 ].map do |number|
      @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", geometry: point,
                            properties: { "species_id" => plant_species(:apple).id, "number" => number })
    end
    @hedge = @map.features.create!(layer: "structures", kind: "hedge", name: "Haie du nord",
                                   geometry: { "type" => "LineString", "coordinates" => [ [ 4.906, 50.341 ], [ 4.907, 50.341 ] ] })
  end

  test "create_tasks links plants by number and elements by id; list_tasks finds the tasks of a plant; update_tasks replaces the links" do
    data, error = call_tool(@owner, "create_tasks", { map_id: @map.id, tasks: [
      { list_name: "Entretien", title: "Recouper les gourmands", numbers: [ "7", "9" ] },
      { list_name: "Entretien", title: "Tailler la haie", feature_ids: [ @hedge.id ] },
      { list_name: "Entretien", title: "Remplacer la protection", numbers: [ "99" ] }
    ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_match "n° 99", data["rejected"].sole["error"]
    gourmands = data["created"].first
    assert_equal [ "n° 7 — Pommier", "n° 9 — Pommier" ], gourmands["features"].map { _1["label"] }
    assert_equal "http://www.example.com/maps/#{@map.id}?feature=#{@apples.first.id}", gourmands["features"].first["url"]

    data, error = call_tool(@viewer, "list_tasks", { map_id: @map.id, numbers: [ "9" ] })
    refute error, data
    assert_equal [ "Recouper les gourmands" ], data["tasks"].map { _1["title"] }

    data, error = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [ { task_id: gourmands["id"], numbers: [ "7" ] } ] })
    refute error, data
    assert_equal [ @apples.first.id ], Task.find(gourmands["id"]).features.map(&:id)

    data, = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [ { task_id: gourmands["id"], feature_ids: [] } ] })
    assert_empty Task.find(gourmands["id"]).features
    assert_nil data["updated"].sole["features"]
  end

  test "an element of another map is refused, and deleting a plant unlinks it" do
    list = @map.task_lists.create!(name: "Entretien")
    task = list.tasks.create!(title: "Tailler", features: [ @apples.first ])
    assert_equal [ @apples.first ], task.features

    foreign = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia))
                 .features.create!(layer: "plants", kind: "plant", geometry: point, properties: {})
    stray = list.tasks.new(title: "Arroser", features: [ foreign ])
    refute stray.valid?
    assert_includes stray.errors.full_messages.to_sentence, "carte de la tâche"

    _, error = call_tool(@owner, "create_tasks", { map_id: @map.id, tasks: [ { list_id: list.id, title: "Arroser", feature_ids: [ foreign.id ] } ] })
    assert error

    task.reload
    @apples.first.destroy!
    assert_empty task.reload.features
  end
end
