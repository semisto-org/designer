require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/territories_test_helper"

# The user's AI reads a territory and proposes what it found for its dossier.
class McpTerritoriesTest < ActionDispatch::IntegrationTest
  include McpTestHelper

  setup do
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @team.grant_territory_module!
    @territory = make_territory(@team)
    @token = personal_token(users(:bob))
  end

  def finds
    [
      { kind: "actor", title: "Cellule GISER", rationale: "Rend des avis après les coulées de boue.", properties: { organization: "SPW" } },
      { kind: "source", title: "PCDN 2016", rationale: "Plan voté par la commune.", properties: { url: "https://example.org/pcdn.pdf", rights: "open", author: "Commune" } },
      { kind: "marker", title: "Coulée de boue, juin 2016", rationale: "Presse locale ; un axe LIDAXES y passe.", geometry: inside_point, properties: { proof: "computed", occurred_on: "2016-06" } },
      { kind: "marker", title: "Trop loin", rationale: "Hors du territoire, à refuser.", geometry: { type: "Point", coordinates: [ 5.9, 50.6 ] } }
    ]
  end

  test "list_territories and get_territory read the team's territories" do
    data, error = call_tool(@token, "list_territories")
    refute error
    assert_equal [ @territory.id ], data["territories"].map { _1["id"] }

    data, error = call_tool(@token, "get_territory", { territory_id: @territory.id })
    refute error
    assert_equal "Yvoir", data["name"]
    assert_equal %w[actor source expectation basin marker lead], data["dossier"].keys
    assert_includes data["values"]["proof"], "confirmed"
    assert_match(/concordance/, data["rules"])
  end

  test "propose_territory_items lays drafts, refuses what is off the territory or already there" do
    data, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: finds })
    refute error
    assert_equal 3, data["created"].size
    assert_equal [ 3 ], data["rejected"].map { _1["index"] }
    assert @territory.items.all? { |item| item.status == "draft" && item.source == "ai" && item.rationale.present? }
    assert_equal "propose_territory_items", AiAction.last.tool

    data, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: [ finds[1].merge(title: "Autre titre") ] })
    assert error, "the same link twice is a duplicate"
    assert_match(/déjà au dossier/, data)
  end

  test "the AI proposes sub-basins, then attaches markers to the one already in the dossier" do
    basins = [ { kind: "basin", title: "Vallon du Bocq", rationale: "Sous-bassin nommé par le contrat de rivière Haute-Meuse.", properties: { order: 1, outlet: "le Bocq" } } ]
    data, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: basins })
    refute error
    basin_id = data["created"].sole["id"]

    marker = { kind: "marker", title: "Coulée de boue, 2021", rationale: "Presse locale, juillet 2021.", geometry: inside_point, properties: { basin_id:, proof: "computed" } }
    stray = marker.merge(title: "Autre coulée", properties: { basin_id: 999_999 })
    data, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: [ marker, stray ] })
    refute error
    assert_equal basin_id, @territory.items.find(data["created"].sole["id"]).prop(:basin_id)
    assert_equal [ 1 ], data["rejected"].map { _1["index"] }

    data, = call_tool(@token, "get_territory", { territory_id: @territory.id })
    assert_equal [ "Vallon du Bocq" ], data["dossier"]["basin"].map { _1["title"] }
  end

  test "withdraw_territory_drafts removes the AI's drafts, never what a person kept" do
    call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: finds.first(2) })
    kept, draft = @territory.items.order(:id).to_a
    kept.accept!(users(:bob))
    data, error = call_tool(@token, "withdraw_territory_drafts", { territory_id: @territory.id, item_ids: [ kept.id, draft.id ] })
    refute error
    assert_equal [ [ draft.id ], [ kept.id ] ], data.values_at("withdrawn", "not_withdrawn")
    assert TerritoryItem.exists?(kept.id)
  end

  test "an outsider's AI does not see the territory; a read-only one cannot propose" do
    text, error = call_tool(personal_token(users(:alice)), "get_territory", { territory_id: @territory.id })
    assert error
    assert_match(/introuvable/, text)

    text, error = call_tool(personal_token(users(:bob), access: "read"), "propose_territory_items", { territory_id: @territory.id, items: finds.first(1) })
    assert error

    @team.revoke_territory_module!
    text, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: finds.first(1) })
    assert error
    assert_match(/n'est pas attribué/, text)
  end
end
