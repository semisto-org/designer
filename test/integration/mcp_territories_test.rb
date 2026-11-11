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
    assert_equal %w[actor source expectation basin marker lead request], data["dossier"].keys
    assert_equal TerritoryItem::REQUEST_STATES, data["properties_by_kind"]["request"]["state"]
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

  test "drafts of one call point to each other by their ref, whatever their order" do
    items = [
      { kind: "marker", title: "Coulée, 2021", rationale: "Presse locale, juillet 2021.", geometry: inside_point, properties: { basin_ref: "bocq", source_refs: [ "press" ] } },
      { kind: "request", title: "Avis GISER sur la coulée", rationale: "La cellule a rendu un avis en 2021.", properties: { actor_ref: "giser", request_kind: "document", state: "to_ask" } },
      { kind: "basin", ref: "bocq", title: "Vallon du Bocq", rationale: "Nommé par le contrat de rivière.", properties: { order: 1 } },
      { kind: "source", ref: "press", title: "L'Avenir, 15 juillet 2021", rationale: "Article de presse sur la coulée.", properties: { url: "https://example.org/a", excerpts: [ "La rue du Moulin sous la boue.", "Trois maisons touchées." ] } },
      { kind: "actor", ref: "giser", title: "Cellule GISER", rationale: "Rend des avis après les coulées." },
      { kind: "lead", title: "Haie", rationale: "Ralentir en tête de vallon.", properties: { basin_ref: "nowhere" } }
    ]
    data, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: })
    refute error
    assert_equal [ 0, 1, 2, 3, 4 ], data["created"].map { _1["index"] }
    assert_equal [ 5 ], data["rejected"].map { _1["index"] }
    assert_match(/nowhere/, data["rejected"].sole["error"])
    by_title = @territory.items.index_by(&:title)
    marker = by_title["Coulée, 2021"]
    assert_equal by_title["Vallon du Bocq"].id, marker.prop(:basin_id)
    assert_equal [ by_title["L'Avenir, 15 juillet 2021"].id ], marker.prop(:source_ids)
    assert_equal by_title["Cellule GISER"].id, by_title["Avis GISER sur la coulée"].prop(:actor_id)

    data, = call_tool(@token, "get_territory", { territory_id: @territory.id })
    assert_equal [ "La rue du Moulin sous la boue.", "Trois maisons touchées." ], data["dossier"]["source"].sole["properties"]["excerpts"]
  end

  test "a ref that fails takes down the drafts that point to it" do
    @territory.items.create!(kind: "basin", title: "Vallon du Bocq")
    items = [
      { kind: "basin", ref: "b", title: "Vallon du Bocq", rationale: "Déjà au dossier : doublon." },
      { kind: "marker", title: "Coulée", rationale: "Presse locale, 2021.", properties: { basin_ref: "b" } }
    ]
    text, error = call_tool(@token, "propose_territory_items", { territory_id: @territory.id, items: })
    assert error
    assert_match(/« b »/, text)
  end

  test "propose_territory_updates proposes changes to kept entries, checked against their schema" do
    lead = @territory.items.create!(kind: "lead", title: "Haie sur talus", properties: { rank: "slow", land: "unknown", keeper: { role: "Commune" } })
    draft = @territory.items.create!(kind: "lead", title: "Brouillon", status: "draft", source: "ai", rationale: "Une piste proposée.")
    updates = [
      { item_id: lead.id, rationale: "Le propriétaire est la commune (atlas des chemins).", changes: { properties: { land: "public", keeper: { hours_per_year: 12 } } } },
      { item_id: draft.id, rationale: "Un brouillon ne se modifie pas.", changes: { title: "Autre" } },
      { item_id: lead.id + 999, rationale: "Introuvable dans le dossier.", changes: { title: "Autre" } }
    ]
    data, error = call_tool(@token, "propose_territory_updates", { territory_id: @territory.id, updates: })
    refute error
    assert_equal [ 1, 2 ], data["rejected"].map { _1["index"] }
    update = TerritoryItemUpdate.find(data["created"].sole["id"])
    assert_equal({ "properties" => { "land" => "public", "keeper" => { "hours_per_year" => 12 } } }, update.proposed_changes)
    assert_equal %w[properties.land properties.keeper.hours_per_year], data["created"].sole["fields"]
    assert_equal "unknown", lead.reload.prop(:land), "nothing changes before a person accepts"

    data, error = call_tool(@token, "propose_territory_updates", { territory_id: @territory.id, updates: [ updates.first ] })
    refute error
    assert_match(/attend déjà/, data["unchanged"].sole["reason"])

    text, error = call_tool(@token, "propose_territory_updates", { territory_id: @territory.id, updates: [ { item_id: lead.id, rationale: "Un attribut qui n'existe pas.", changes: { properties: { owner: "Dupont" } } } ] })
    assert error
    assert_match(/owner.*n'est pas un attribut/, text)
    text, error = call_tool(@token, "propose_territory_updates", { territory_id: @territory.id, updates: [ { item_id: lead.id, rationale: "Une valeur qui n'existe pas.", changes: { properties: { land: "communal" } } } ] })
    assert error
    assert_match(/public, agricultural/, text)

    data, = call_tool(@token, "get_territory", { territory_id: @territory.id })
    pending = data["dossier"]["lead"].find { _1["id"] == lead.id }["pending_update"]
    assert_equal [ "unknown", "public" ], pending["changes"].find { _1["field"] == "properties.land" }.values_at("before", "after")
  end

  test "propose_territory_deletions proposes to remove kept entries; withdraw_territory_drafts takes it back" do
    kept = @territory.items.create!(kind: "source", title: "PCDN en double", properties: { url: "https://example.org/x" })
    draft = @territory.items.create!(kind: "source", title: "Brouillon", status: "draft", source: "ai", rationale: "Une source proposée.")
    data, error = call_tool(@token, "propose_territory_deletions", { territory_id: @territory.id, item_ids: [ kept.id, draft.id ], rationale: "La même source que le PCDN 2016." })
    refute error
    update_id = data["created"].sole["id"]
    assert_match(/withdraw_territory_drafts/, data["rejected"].sole["error"])
    assert TerritoryItemUpdate.find(update_id).deletion?

    data, error = call_tool(@token, "withdraw_territory_drafts", { territory_id: @territory.id, update_ids: [ update_id ] })
    refute error
    assert_equal [ update_id ], data["withdrawn_updates"]
    assert_equal "withdrawn", TerritoryItemUpdate.find(update_id).status
    assert TerritoryItem.exists?(kept.id)
  end
end
