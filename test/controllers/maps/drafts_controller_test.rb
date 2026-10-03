require "test_helper"
require "test_helpers/mcp_test_helper"

class Maps::DraftsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @drafts = 3.times.map do |i|
      @map.features.create!(layer: "plants", kind: "tree", name: "Arbre #{i}", status: "draft", source: "ai",
        rationale: "Une raison solide.", geometry: point(lng: 4.906 + i * 0.0001))
    end
    AiAction.create!(user: users(:michael), map: @map, tool: "propose_features", client_name: "Claude",
      arguments: { "summary" => "Un verger" }, result: { "feature_ids" => @drafts.map(&:id) })
  end

  test "lists drafts with the client that proposed them" do
    sign_in_as users(:alice)
    get map_drafts_path(@map), as: :json
    assert_response :success
    assert_equal @drafts.map(&:id), response.parsed_body["drafts"].map { |f| f["id"] }
    assert_equal "Claude", response.parsed_body["author"]
    assert_equal "Un verger", response.parsed_body["summary"]
  end

  test "viewers cannot review" do
    sign_in_as users(:alice)
    post accept_map_draft_path(@map, @drafts.first), as: :json
    assert_response :forbidden
    assert_equal "draft", @drafts.first.reload.status
  end

  test "accept keeps the AI source, reject hides the element" do
    sign_in_as users(:michael)
    post accept_map_draft_path(@map, @drafts.first), as: :json
    assert_response :success
    assert_equal "active", response.parsed_body.dig("properties", "status")
    assert_equal [ "active", "ai", users(:michael) ], [ @drafts.first.reload.status, @drafts.first.source, @drafts.first.updated_by ]

    post reject_map_draft_path(@map, @drafts.second), as: :json
    assert_response :success
    assert_equal "rejected", @drafts.second.reload.status

    post accept_map_draft_path(@map, @drafts.first), as: :json
    assert_response :not_found, "only drafts can be reviewed"

    get map_features_path(@map), as: :json
    refute_includes response.parsed_body["features"].map { |f| f["id"] }, @drafts.second.id
  end

  test "accept all only the drafts the reviewer saw; reject all" do
    sign_in_as users(:michael)
    post accept_all_map_drafts_path(@map), params: { ids: @drafts.first(2).map(&:id) }, as: :json
    assert_response :success
    assert_equal 2, response.parsed_body["features"].size
    assert_equal %w[active active draft], @drafts.map { |d| d.reload.status }

    post reject_all_map_drafts_path(@map), as: :json
    assert_equal [ @drafts.last.id ], response.parsed_body["ids"]
    assert_equal "rejected", @drafts.last.reload.status
  end
end
