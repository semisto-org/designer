require "test_helper"

class Maps::PresentationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
  end

  test "an editor starts a presentation from the pre-design template" do
    sign_in_as users(:michael)
    post map_presentations_path(@map), params: { template: "pre_design" }, as: :json
    assert_response :created
    presentation = response.parsed_body["presentations"].first
    assert_equal "Pré-design", presentation["name"]
    assert_equal "pre_design", presentation["templateKey"]
    wind = presentation["steps"].find { _1["key"] == "wind" }
    assert_equal "Vent", wind["title"]
    assert_equal [ "wind" ], wind["view"]["sectors"]
    assert_includes wind["view"]["hiddenLayers"], "plants"
    assert_not_includes wind["view"]["hiddenLayers"], "existing"
    assert_not wind["captured"]
    high = presentation["steps"].find { _1["key"] == "strata_high" }
    assert_not_includes high["view"]["hiddenStrata"], "canopy"
    assert_includes high["view"]["hiddenStrata"], "shrub"
    assert_equal [ { "key" => "pre_design", "name" => "Pré-design", "count" => presentation["steps"].size } ], response.parsed_body["templates"]
  end

  test "an editor saves captured steps whole, cleaned" do
    sign_in_as users(:michael)
    presentation = @map.presentations.create!(name: "Lautenne")
    steps = [
      { id: "a", title: "  Vent  ", note: "Côté est à protéger", shown: true, captured: true,
        view: { camera: { center: [ 4.9, 50.3 ], zoom: 18.234, bearing: 12, pitch: 40 }, panel: "sun", hiddenLayers: %w[plants bogus],
                hiddenStrata: %w[canopy], sectors: %w[wind nope], moment: "year15", shade: "december", featureId: "12", evil: "x" } },
      { id: "b", title: "", note: "sans titre" },
      { id: "c", title: "Sol", shown: false }
    ]
    patch map_presentation_path(@map, presentation), params: { presentation: { steps:, lock_version: 0 } }, as: :json
    assert_response :success
    saved = presentation.reload.steps
    assert_equal %w[a c], saved.map { _1["id"] }
    assert_equal "Vent", saved[0]["title"]
    view = saved[0]["view"]
    assert_equal({ "center" => [ 4.9, 50.3 ], "zoom" => 18.23, "bearing" => 12.0, "pitch" => 40.0 }, view["camera"])
    assert_equal %w[plants], view["hiddenLayers"]
    assert_equal %w[wind], view["sectors"]
    assert_equal 12, view["featureId"]
    assert_nil view["evil"]
    assert_not saved[1]["shown"]
  end

  test "a stale save answers the presentation as it stands" do
    sign_in_as users(:michael)
    presentation = @map.presentations.create!(name: "Lautenne")
    presentation.update!(name: "Lautenne, lundi")
    patch map_presentation_path(@map, presentation), params: { presentation: { name: "Autre", lock_version: 0 } }, as: :json
    assert_response :conflict
    assert_equal "Lautenne, lundi", response.parsed_body["presentations"].first["name"]
  end

  test "viewers follow a presentation but cannot change it" do
    presentation = @map.presentations.create!(name: "Lautenne", steps: [ { title: "Vent" } ])
    sign_in_as users(:alice)
    get map_presentations_path(@map), as: :json
    assert_response :success
    assert_equal "Vent", response.parsed_body["presentations"].first["steps"].first["title"]
    post map_presentations_path(@map), params: { template: "pre_design" }, as: :json
    assert_response :forbidden
    patch map_presentation_path(@map, presentation), params: { presentation: { name: "X" } }, as: :json
    assert_response :forbidden
    delete map_presentation_path(@map, presentation), as: :json
    assert_response :forbidden
  end

  test "an editor deletes a presentation; an unknown template is not found" do
    sign_in_as users(:michael)
    presentation = @map.presentations.create!(name: "Lautenne")
    delete map_presentation_path(@map, presentation), as: :json
    assert_response :success
    assert_empty response.parsed_body["presentations"]
    post map_presentations_path(@map), params: { template: "nope" }, as: :json
    assert_response :not_found
  end
end
