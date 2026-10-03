require "test_helper"

class Maps::AiActionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @kept = @map.features.create!(layer: "plants", kind: "tree", status: "active", source: "ai", rationale: "Bonne raison.", geometry: point)
    @refused = @map.features.create!(layer: "plants", kind: "tree", status: "rejected", source: "ai", rationale: "Bonne raison.", geometry: point)
    @proposal = AiAction.create!(user: users(:alice), map: @map, tool: "propose_features", client_name: "Claude",
      arguments: { "features" => 3 }, result: { "created" => 3, "feature_ids" => [ @kept.id, @refused.id, 0 ] })
    AiAction.create!(user: users(:alice), map: @map, tool: "get_map", client_name: "Claude")
  end

  test "the owner reads the journal with the outcome of each proposal" do
    sign_in_as users(:michael)
    get map_ai_actions_path(@map), as: :json
    assert_response :success
    actions = response.parsed_body["actions"]
    assert_equal %w[get_map propose_features], actions.map { |a| a["tool"] }
    assert_equal "Alice", actions.first["userName"]
    assert_equal({ "active" => 1, "rejected" => 1, "withdrawn" => 1 }, actions.last["outcome"])
    assert_nil response.parsed_body["nextBeforeId"]
  end

  test "only the owner" do
    sign_in_as users(:alice)
    get map_ai_actions_path(@map), as: :json
    assert_response :forbidden
  end
end
