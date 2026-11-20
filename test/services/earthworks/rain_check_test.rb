require "test_helper"
require "test_helpers/mcp_test_helper"

class Earthworks::RainCheckTest < ActionDispatch::IntegrationTest
  LINE = { "type" => "LineString", "coordinates" => [ [ 4.906, 50.3 ], [ 4.907, 50.3 ] ] }.freeze
  RING = { "type" => "Polygon", "coordinates" => [ [ [ 4.906, 50.3 ], [ 4.9061, 50.3 ], [ 4.9061, 50.3001 ], [ 4.906, 50.3 ] ] ] }.freeze

  setup { @map = maps(:ahinvaux) }

  test "a new swale gets one task, tied to it, in its own list" do
    swale = @map.features.create!(layer: "water", kind: "swale", name: "Haut du verger", geometry: LINE)
    task = Earthworks::RainCheck.add!(swale, by: users(:michael))
    assert_equal "Baissière « Haut du verger » : aller voir l'eau après la prochaine grosse averse", task.title
    assert_equal [ swale ], task.features.to_a
    assert_equal "rain_checks", task.task_list.key
    assert_match "Pendant l'averse", task.notes
    assert_equal users(:michael), task.created_by
    # Once only.
    assert_no_difference -> { Task.count } do
      assert_equal task, Earthworks::RainCheck.add!(swale, by: users(:michael))
    end
  end

  test "plants, drafts and works already on the land get none" do
    tree = @map.features.create!(layer: "plants", kind: "tree", geometry: { "type" => "Point", "coordinates" => [ 4.906, 50.3 ] })
    draft = @map.features.create!(layer: "water", kind: "pond", geometry: RING, status: "draft", source: "ai", rationale: "Une raison.")
    assert_no_difference -> { Task.count } do
      assert_nil Earthworks::RainCheck.add!(tree, by: users(:michael))
      assert_nil Earthworks::RainCheck.add!(draft, by: users(:michael))
    end
  end

  test "the summary counts the downpours noted since the work" do
    mound = @map.features.create!(layer: "structures", kind: "mound", geometry: RING)
    task = Earthworks::RainCheck.add!(mound, by: users(:michael))
    assert_equal({ task_id: task.id, title: task.title, done: false, storm_observations_since: 0 }, Earthworks::RainCheck.summary(mound))
    @map.features.create!(layer: "water", kind: "storm_observation", geometry: LINE, properties: { "rain" => "heavy" })
    assert_equal 1, Earthworks::RainCheck.summary(mound)[:storm_observations_since]
  end

  test "creating a swale through the features API adds its task and says so" do
    sign_in_as users(:michael)
    assert_difference -> { Task.where(key: "rain_check").count }, 1 do
      post map_features_path(@map), params: { feature: { layer: "water", kind: "swale", geometry: LINE, properties: { depth_m: 0.4, traced_in: "3d" } } }, as: :json
    end
    assert_response :created
    body = response.parsed_body
    assert_equal Task.find_by(key: "rain_check").id, body.dig("rainCheck", "taskId")
    assert_match "aller voir l'eau", body.dig("rainCheck", "title")
    assert_equal "3d", body.dig("properties", "traced_in")
  end

  test "a building drawn through the API gets no task" do
    sign_in_as users(:michael)
    assert_no_difference -> { Task.count } do
      post map_features_path(@map), params: { feature: { layer: "existing", kind: "building", geometry: RING } }, as: :json
    end
    assert_response :created
    assert_nil response.parsed_body["rainCheck"]
  end

  test "an AI pond accepted gets its task, and get_feature tells the AI" do
    draft = @map.features.create!(layer: "water", kind: "pond", geometry: RING, status: "draft", source: "ai", rationale: "Le point bas.")
    sign_in_as users(:michael)
    post accept_map_draft_path(@map, draft), as: :json
    assert_response :success
    task = Earthworks::RainCheck.for_feature(draft)
    assert task

    data, error = call_tool(personal_token(users(:alice)), "get_feature", { map_id: @map.id, feature_id: draft.id })
    refute error, data
    assert_equal({ "task_id" => task.id, "title" => task.title, "done" => false, "storm_observations_since" => 0 }, data["rain_check"])
  end

  test "drafts accepted at once get theirs" do
    drafts = 2.times.map { @map.features.create!(layer: "water", kind: "swale", geometry: LINE, status: "draft", source: "ai", rationale: "Une raison.") }
    sign_in_as users(:michael)
    assert_difference -> { Task.where(key: "rain_check").count }, 2 do
      post accept_all_map_drafts_path(@map), params: { ids: drafts.map(&:id) }, as: :json
    end
    assert_response :success
  end
end
