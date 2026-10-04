require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require "test_helpers/mcp_test_helper"

# A team map through the other doors: the MCP server, the public view,
# discussions and the journey. Team members are editors, nothing more.
class TeamMapsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @colleague = users(:bob)
    @team = make_team("Semisto", admin: @owner, members: [ @colleague ])
    @map.update!(organization: @team)
  end

  test "MCP: a team member lists, reads and proposes drafts as an editor" do
    token = personal_token(@colleague)
    data, error = call_tool(token, "list_maps")
    refute error
    assert_equal [ [ @map.id, "editor" ] ], data["maps"].map { |m| m.values_at("id", "role") }

    data, error = call_tool(token, "get_map", { map_id: @map.id })
    refute error, data
    assert data.dig("permissions", "propose_drafts")

    feature = { layer: "plants", kind: "tree", rationale: "Plein sud, à l'abri du vent.", geometry: point(lng: 4.906, lat: 50.341) }
    data, error = call_tool(token, "propose_features", { map_id: @map.id, features: [ feature ] })
    refute error, data
    assert_equal 1, @map.features.drafts.count
  end

  test "MCP: the owner's plan decides, and a former member loses the map" do
    token = personal_token(@colleague)
    feature = { layer: "plants", kind: "tree", rationale: "Plein sud, à l'abri du vent.", geometry: point(lng: 4.906, lat: 50.341) }
    with_billing do
      text, error = call_tool(token, "propose_features", { map_id: @map.id, features: [ feature ] })
      assert error
      assert_match(/forfait/, text)
    end

    @team.membership_for(@colleague).destroy!
    data, = call_tool(token, "list_maps")
    assert_empty data["maps"]
    _, error = call_tool(token, "get_map", { map_id: @map.id })
    assert error
  end

  test "public view: only the owner publishes; the published team map reads without an account" do
    sign_in_as @colleague
    post map_publication_path(@map), params: { publication: { title: "Le projet" } }, as: :json
    assert_response :forbidden

    @team.update!(name: "Bureau Zéphyr")
    publication = MapPublication.publish!(@map, by: @owner, title: "Le projet")
    sign_out
    get public_map_path(publication.token), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "Le projet", props["title"]
    assert_no_match(/Zéphyr/, response.body, "the team is not exposed publicly")
  end

  test "discussions: team members comment and can be mentioned" do
    sign_in_as @colleague
    post map_comments_path(@map), params: { comment: { commentable_type: "Map", commentable_id: @map.id, body: "On plante quand, @Michael ?" } }, as: :json
    assert_response :created
    assert_equal [ @owner.id ], Comment.last.mentioned_user_ids

    sign_in_as @owner
    get map_comments_path(@map), params: { commentable_type: "Map", commentable_id: @map.id }, as: :json
    assert_includes response.parsed_body["members"].map { |m| m["id"] }, @colleague.id
  end

  test "journey: team members follow it; requests to Semisto stay with the owner" do
    sign_in_as @colleague
    get map_journey_path(@map), as: :json
    assert_response :success
    assert_equal 4, response.parsed_body["steps"].size

    post map_service_requests_path(@map), params: { service_request: { kind: "order_plants", contact_consent: true } }, as: :json
    assert_response :forbidden
  end

  test "the map editor opens for a team member, with editing rights" do
    sign_in_as @colleague
    get map_path(@map), headers: inertia_headers
    assert_response :success
    assert_equal "editor", response.parsed_body.dig("props", "map", "role")
    patch map_path(@map), params: { map: { name: "Domaine d'Ahinvaux (équipe)" } }, as: :json
    assert_response :success
    delete map_path(@map)
    assert_nil @map.reload.archived_at, "archiving stays with the owner"
  end
end
