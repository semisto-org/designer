require "test_helper"
require "test_helpers/mcp_test_helper"

# propose_feature_updates: an AI proposes changes to elements already on
# the map, a person reviews them.
class McpFeatureUpdatesTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @apple = plant_species(:apple)
    @herbs = 3.times.map do |i|
      @map.features.create!(layer: "plants", kind: "plant", name: "Consoude #{i}", tags: [ "Strate basse" ],
        properties: { "species_id" => plant_species(:comfrey).id }, geometry: point(lng: 4.906 + (i * 0.0001), lat: 50.341))
    end
    @tree = @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", properties: { "species_id" => @apple.id },
      geometry: point(lng: 4.9062, lat: 50.3412))
  end

  def rationale = "Plantées le 23/05/2026, confirmé par Michael."

  def with_max_filtered(value)
    previous = Mcp::UpdateProposal::MAX_FILTERED
    Mcp::UpdateProposal.send(:remove_const, :MAX_FILTERED)
    Mcp::UpdateProposal.const_set(:MAX_FILTERED, value)
    yield
  ensure
    Mcp::UpdateProposal.send(:remove_const, :MAX_FILTERED)
    Mcp::UpdateProposal.const_set(:MAX_FILTERED, previous)
  end

  test "one element: a pending change with its diff, nothing changes on the map" do
    data, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, summary: "Dates de plantation",
      updates: [ { feature_id: @tree.id, changes: { name: "Pommier Reinette", properties: { planted_on: "2026-05-23" } }, rationale: } ]
    })
    refute error, data
    created = data["created"].sole
    assert_equal @tree.id, created["feature_id"]
    assert_includes created["diff"], { "field" => "name", "before" => "Pommier", "after" => "Pommier Reinette" }
    assert_includes created["diff"], { "field" => "properties.planted_on", "before" => nil, "after" => "2026-05-23" }
    assert_equal 1, data["pending_update_drafts"]
    assert_equal "http://www.example.com/maps/#{@map.id}", data["review_url"]

    assert_equal "Pommier", @tree.reload.name, "the map does not change before a person accepts"
    draft = FeatureUpdateDraft.find(created["id"])
    assert_equal [ "pending", users(:michael), "Dates de plantation" ], [ draft.status, draft.created_by, draft.summary ]
    assert_equal({ "name" => "Pommier Reinette", "properties" => { "planted_on" => "2026-05-23" } }, draft.proposed_changes)

    action = AiAction.last
    assert_equal [ "propose_feature_updates", "ok" ], [ action.tool, action.status ]
    assert_equal [ @tree.id ], action.result["feature_ids"]
  end

  test "a batch by ids and a batch by filter" do
    ids = @herbs.map(&:id)
    data, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, updates: ids.map { |id| { feature_id: id, changes: { notes: "Paillées" }, rationale: } }
    })
    refute error, data
    assert_equal ids, data["created"].map { |c| c["feature_id"] }
    assert_equal 1, FeatureUpdateDraft.where(id: data["created"].map { |c| c["id"] }).distinct.count(:batch)

    data, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, summary: "Herbacées", filter: { tag: "strate basse" },
      changes: { properties: { planted_on: "2026-05-23" } }, rationale:
    })
    refute error, data
    assert_equal 3, data["targeted"]
    assert_equal ids, data["created"].map { |c| c["feature_id"] }
    assert_equal ids.size, data["created"].count { |c| c["replaces"] }, "the new proposal replaces the pending one"
    assert_equal 3, data["pending_update_drafts"]
    assert_equal 3, FeatureUpdateDraft.where(status: "withdrawn").count

    data, = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, filter: { species_id: @apple.id, layer: "plants" }, changes: { tags: [ "Verger" ] }, rationale:
    })
    assert_equal [ @tree.id ], data["created"].map { |c| c["feature_id"] }

    text, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, filter: { tag: "inconnue" }, changes: { notes: "x" }, rationale:
    })
    assert error
    assert_match(/Aucun élément actif/, text)

    with_max_filtered(2) do
      text, error = call_tool(@owner, "propose_feature_updates", {
        map_id: @map.id, filter: { kind: "plant" }, changes: { notes: "x" }, rationale:
      })
      assert error
      assert_match(/4 éléments, 2 au plus/, text)
    end
  end

  test "forbidden fields, bad values and elements that cannot change are refused with their reason" do
    other_map = Map.create!(name: "Autre", owner: users(:michael), region: regions(:wallonia))
    elsewhere = other_map.features.create!(layer: "plants", kind: "plant", geometry: point)
    draft = @map.features.create!(layer: "plants", kind: "tree", status: "draft", source: "ai", rationale: "x" * 12, geometry: point)
    pipe = @map.features.create!(layer: "networks", kind: "water_pipe", geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.3401 ], [ 4.906, 50.3401 ] ] })
    updates = [
      { feature_id: @tree.id, changes: { layer: "water", kind: "pond" }, rationale: },
      { feature_id: @tree.id, changes: { properties: { planted_on: "23/05/2026" } }, rationale: },
      { feature_id: @tree.id, changes: { properties: { species_id: 999_999 } }, rationale: },
      { feature_id: @tree.id, changes: { properties: { variety_id: 999_999 } }, rationale: },
      { feature_id: @tree.id, changes: { properties: { status: "draft" } }, rationale: },
      { feature_id: elsewhere.id, changes: { notes: "x" }, rationale: },
      { feature_id: draft.id, changes: { notes: "x" }, rationale: },
      { feature_id: pipe.id, changes: { notes: "x" }, rationale: },
      { feature_id: @tree.id, changes: { geometry: { type: "Point", coordinates: [ 4.95, 50.36 ] } }, rationale: },
      { feature_id: @tree.id, changes: { geometry: square }, rationale: },
      { feature_id: @herbs[0].id, changes: { properties: { variety_id: plant_varieties(:reinette).id } }, rationale: },
      { feature_id: @herbs[1].id, changes: { geometry: point(lng: 4.9065, lat: 50.3411) }, rationale: }
    ]
    data, error = call_tool(@owner, "propose_feature_updates", { map_id: @map.id, updates: })
    refute error, data
    reasons = data["rejected"].map { |r| r["error"] }
    assert_equal 11, reasons.size, reasons.inspect
    assert_match(/champs interdits.*layer, kind/, reasons[0])
    assert_match(/AAAA-MM-JJ/, reasons[1])
    assert_match(/espèce 999999/, reasons[2])
    assert_match(/variété 999999/, reasons[3])
    assert_match(/champs système/, reasons[4])
    assert_match(/n'existe pas sur cette carte/, reasons[5])
    assert_match(/pas actif \(draft\)/, reasons[6])
    assert_match(/réseaux/, reasons[7])
    assert_match(/hors du terrain/, reasons[8])
    assert_match(/même type.*Point/, reasons[9])
    assert_match(/ne serait plus valide/, reasons[10], "a variety of another species")
    assert_equal [ @herbs[1].id ], data["created"].map { |c| c["feature_id"] }

    text, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, filter: { tag: "strate basse" }, changes: { status: "active" }, rationale:
    })
    assert error
    assert_match(/champs interdits/, text)

    _text, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, updates: [ { feature_id: @tree.id, changes: { notes: "x" }, rationale: } ], filter: { kind: "plant" }
    })
    assert error, "updates or filter, not both"
  end

  test "a tree kept as a pollard or a coppice: the training goes through, with its name for the review" do
    data, error = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, updates: [
        { feature_id: @tree.id, changes: { properties: { training: "pollard" } }, rationale: "Taillé en têtard tous les 5 ans, d'après Michael." },
        { feature_id: @herbs[0].id, changes: { properties: { training: "espalier" } }, rationale: "Une forme qui n'existe pas encore." }
      ]
    })
    refute error, data
    created = data["created"].sole
    assert_includes created["diff"], { "field" => "properties.training", "before" => nil, "after" => "pollard" }
    assert_match(/training vaut pollard, coppice/, data["rejected"].sole["error"])
    change = FeatureUpdateDraft.find(created["id"]).as_review_json[:changes].sole
    assert_equal "En trogne (taillé en tête)", change[:afterLabel]
  end

  test "idempotent: what changes nothing comes back as unchanged" do
    args = { map_id: @map.id, filter: { tag: "Strate basse" }, changes: { properties: { planted_on: "2026-05-23" } }, rationale: }
    call_tool(@owner, "propose_feature_updates", args)
    data, error = call_tool(@owner, "propose_feature_updates", args)
    refute error, data
    assert_empty data["created"]
    assert_equal 3, data["unchanged"].size
    assert_match(/attend déjà/, data["unchanged"].first["reason"])
    assert_nil data["batch"]
    assert_equal 3, FeatureUpdateDraft.pending.count

    data, = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, updates: [ { feature_id: @tree.id, changes: { name: "Pommier", properties: { species_id: @apple.id, count: nil } }, rationale: } ]
    })
    assert_match(/déjà ces valeurs/, data["unchanged"].sole["reason"])
  end

  test "withdraw_draft withdraws pending changes only" do
    data, = call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, updates: [ { feature_id: @tree.id, changes: { notes: "Taillé" }, rationale: } ]
    })
    id = data["created"].sole["id"]
    accepted = @map.feature_update_drafts.create!(map_feature: @herbs[0], batch: "b", proposed_changes: { "notes" => "x" }, rationale:, status: "accepted")

    data, error = call_tool(@owner, "withdraw_draft", { map_id: @map.id, update_ids: [ id, accepted.id ] })
    refute error, data
    assert_equal [ id ], data["withdrawn_updates"]
    assert_equal [ accepted.id ], data["updates_not_found"]
    assert_equal 0, data["pending_update_drafts"]
    assert_equal "withdrawn", FeatureUpdateDraft.find(id).status

    _text, error = call_tool(@owner, "withdraw_draft", { map_id: @map.id })
    assert error
  end

  test "same rights as propose_features: drafts scope, editor role, the map's plan" do
    args = { map_id: @map.id, updates: [ { feature_id: @tree.id, changes: { notes: "x" }, rationale: } ] }
    text, error = call_tool(@viewer, "propose_feature_updates", args)
    assert error
    assert_match(/propriétaire et les éditeurs/, text)

    text, error = call_tool(personal_token(users(:michael), access: "read"), "propose_feature_updates", args)
    assert error
    assert_match(/lecture/, text)

    with_billing do
      text, error = call_tool(@owner, "propose_feature_updates", args)
      assert error
      assert_match(/forfait/, text)
    end
    assert_equal 0, FeatureUpdateDraft.count
  end

  test "list_features, get_feature and get_map show what waits for review" do
    call_tool(@owner, "propose_feature_updates", {
      map_id: @map.id, summary: "Dates", updates: [ { feature_id: @tree.id, changes: { properties: { planted_on: "2026-05-23" } }, rationale: } ]
    })
    data, = call_tool(@viewer, "list_features", { map_id: @map.id, layer: "plants" })
    tree = data["features"].find { |f| f["id"] == @tree.id }
    assert_equal [ { "field" => "properties.planted_on", "before" => nil, "after" => "2026-05-23" } ], tree.dig("pending_update", "changes")
    assert_equal rationale, tree.dig("pending_update", "rationale")
    assert_nil data["features"].find { |f| f["id"] == @herbs[0].id }["pending_update"]

    data, = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: @tree.id })
    assert_equal "Dates", data.dig("pending_update", "summary")

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_equal 1, data.dig("elements", "updates_pending")
  end

  test "the server instructions and the tool description tell when to use it" do
    body = mcp_request(@owner, "tools/list")
    tool = body.dig("result", "tools").find { |t| t["name"] == "propose_feature_updates" }
    assert_match(/Pour changer un élément déjà accepté.*utilise propose_features/, tool["description"])
    assert_match(/strate basse/, tool["description"])
    assert_includes tool.dig("inputSchema", "properties").keys, "filter"
    assert_match(/propose_feature_updates/, I18n.t("mcp.server.instructions"))
  end
end
