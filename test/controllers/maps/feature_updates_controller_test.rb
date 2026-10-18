require "test_helper"
require "test_helpers/mcp_test_helper"

class Maps::FeatureUpdatesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @comfrey = plant_species(:comfrey)
  end

  def plant(i, tags: [ "strate basse" ])
    @map.features.create!(layer: "plants", kind: "plant", name: "Herbacée #{i}", tags:, properties: { "species_id" => @comfrey.id },
      geometry: point(lng: 4.9055 + ((i % 12) * 0.0001), lat: 50.3405 + ((i / 12) * 0.0001)))
  end

  def propose(feature, changes, batch: "lot-1", summary: "Dates")
    @map.feature_update_drafts.create!(map_feature: feature, batch:, summary:, proposed_changes: changes,
      rationale: "Plantées le 23/05/2026.", created_by: users(:michael), client_name: "Claude")
  end

  test "the acceptance case: one MCP call on 96 herbs, then « Tout accepter » applies them all" do
    herbs = 96.times.map { |i| plant(i) }
    other = plant(200, tags: [ "strate haute" ])
    data, error = call_tool(personal_token(users(:michael)), "propose_feature_updates", {
      map_id: @map.id, filter: { tag: "strate basse" }, changes: { properties: { planted_on: "2026-05-23" } },
      rationale: "Herbacées plantées le 23/05/2026 (confirmé par Michael)"
    })
    refute error, data
    assert_equal [ 96, 96 ], [ data["targeted"], data["created"].size ]
    assert_nil herbs.first.reload.planted_on

    sign_in_as users(:michael)
    get map_feature_updates_path(@map), as: :json
    assert_response :success
    batch = response.parsed_body["batches"].sole
    assert_equal [ 96, "Claude Code" ], batch.values_at("count", "clientName")
    ids = response.parsed_body["updates"].map { |u| u["id"] }

    post accept_all_map_feature_updates_path(@map), params: { batch: batch["batch"], ids: }, as: :json
    assert_response :success
    assert_equal 96, response.parsed_body["features"].size
    assert_empty response.parsed_body["failed"]
    assert(herbs.all? { |h| h.reload.planted_on == Date.new(2026, 5, 23) })
    assert_equal users(:michael), herbs.first.updated_by
    assert_nil other.reload.planted_on
    assert_equal 0, @map.feature_update_drafts.pending.count

    get map_feature_updates_path(@map, feature_id: herbs.first.id), as: :json
    entry = response.parsed_body["history"].sole
    assert_equal [ "accepted", "Claude Code", users(:michael).display_name ], entry.values_at("status", "clientName", "reviewerName")
    assert_equal [ { "field" => "properties.planted_on", "before" => nil, "after" => "2026-05-23" } ], entry["changes"]
  end

  test "lists the pending changes with their diff and names for catalogue ids" do
    herb = plant(1)
    propose(herb, { "properties" => { "species_id" => plant_species(:apple).id } })
    sign_in_as users(:alice)
    get map_feature_updates_path(@map), as: :json
    change = response.parsed_body["updates"].sole["changes"].sole
    assert_equal [ "properties.species_id", @comfrey.id, plant_species(:apple).id ], change.values_at("field", "before", "after")
    assert_match(/Malus/, change["afterLabel"])
  end

  test "accept, adjust then accept, reject" do
    herbs = 3.times.map { |i| plant(i) }
    first = propose(herbs[0], { "name" => "Consoude", "properties" => { "planted_on" => "2026-05-23" } })
    second = propose(herbs[1], { "name" => "Consoude", "properties" => { "planted_on" => "2026-05-23" } })
    third = propose(herbs[2], { "notes" => "Paillée" })
    sign_in_as users(:michael)

    post accept_map_feature_update_path(@map, first), as: :json
    assert_response :success
    assert_equal [ "Consoude", Date.new(2026, 5, 23) ], [ herbs[0].reload.name, herbs[0].planted_on ]
    assert_equal "accepted", first.reload.status

    post accept_map_feature_update_path(@map, second), params: { changes: { name: "Consoude de Russie", properties: { planted_on: "2026-05-24" } } }, as: :json
    assert_response :success
    assert_equal [ "Consoude de Russie", Date.new(2026, 5, 24) ], [ herbs[1].reload.name, herbs[1].planted_on ]
    assert second.reload.as_history_json[:adjusted]
    assert_equal({ "name" => "Herbacée 1", "properties" => { "planted_on" => nil } }, second.previous_values)

    post reject_map_feature_update_path(@map, third), as: :json
    assert_response :success
    assert_equal [ "rejected", nil ], [ third.reload.status, herbs[2].reload.notes ]

    post accept_map_feature_update_path(@map, third), as: :json
    assert_response :not_found, "a reviewed change cannot be reviewed again"
  end

  test "a change that would make the element invalid is refused, the others of the batch apply" do
    herbs = 2.times.map { |i| plant(i) }
    good = propose(herbs[0], { "notes" => "Paillée" })
    bad = propose(herbs[1], { "properties" => { "variety_id" => plant_varieties(:reinette).id } })
    sign_in_as users(:michael)

    post accept_map_feature_update_path(@map, bad), as: :json
    assert_response :unprocessable_entity
    assert_equal "pending", bad.reload.status

    post accept_all_map_feature_updates_path(@map), params: { batch: "lot-1", ids: [ good.id, bad.id ] }, as: :json
    assert_response :success
    assert_equal [ herbs[0].id ], response.parsed_body["features"].map { |f| f["id"] }
    assert_equal [ bad.id ], response.parsed_body["failed"].map { |f| f["id"] }
    assert_equal [ "accepted", "pending" ], [ good.reload.status, bad.reload.status ]
  end

  test "reject_all rejects only the changes of the batch the reviewer saw" do
    herbs = 3.times.map { |i| plant(i) }
    seen = propose(herbs[0], { "notes" => "a" })
    unseen = propose(herbs[1], { "notes" => "b" })
    other_batch = propose(herbs[2], { "notes" => "c" }, batch: "lot-2")
    sign_in_as users(:michael)

    post reject_all_map_feature_updates_path(@map), params: { batch: "lot-1", ids: [ seen.id, other_batch.id ] }, as: :json
    assert_response :success
    assert_equal [ seen.id ], response.parsed_body["ids"]
    assert_equal %w[rejected pending pending], [ seen, unseen, other_batch ].map { |d| d.reload.status }
  end

  test "viewers see the changes but cannot review them" do
    draft = propose(plant(1), { "notes" => "a" })
    sign_in_as users(:alice)
    post accept_map_feature_update_path(@map, draft), as: :json
    assert_response :forbidden
    post accept_all_map_feature_updates_path(@map), params: { batch: "lot-1" }, as: :json
    assert_response :forbidden
    assert_equal "pending", draft.reload.status
  end

  test "the AI journal tells what became of the proposed changes" do
    herbs = 2.times.map { |i| plant(i) }
    accepted = propose(herbs[0], { "notes" => "a" })
    accepted.update!(status: "accepted")
    pending = propose(herbs[1], { "notes" => "b" })
    AiAction.create!(user: users(:michael), map: @map, tool: "propose_feature_updates", status: "ok",
      result: { "update_ids" => [ accepted.id, pending.id ] })
    sign_in_as users(:michael)
    get map_ai_actions_path(@map), as: :json
    assert_equal({ "active" => 1, "draft" => 1 }, response.parsed_body["actions"].first["outcome"])
  end

  test "renumbering a whole map in one proposal: the new numbers cover the old ones, « Tout accepter » swaps them in" do
    trees = 4.times.map { |i| plant(i) }
    outside = plant(10)
    assert_equal [ 1, 2, 3, 4 ], trees.map { |t| t.reload.plant_number }
    # Field labels: 1 → 3, 2 → 1, 3 → 4, 4 → 2 (a cycle, every number already taken).
    targets = { trees[0] => 3, trees[1] => 1, trees[2] => 4, trees[3] => 2 }
    data, error = call_tool(personal_token(users(:michael)), "propose_feature_updates", {
      map_id: @map.id, summary: "Numéros des étiquettes",
      updates: targets.map { |tree, number| { feature_id: tree.id, changes: { properties: { number: } }, rationale: "Numéro de l'étiquette sur le terrain." } }
    })
    refute error, data
    assert_equal 4, data["created"].size
    assert(data["created"].none? { |c| c["swaps_with"] }, "every holder is renumbered by the same proposal")
    assert_equal [ 1, 2, 3, 4 ], trees.map { |t| t.reload.plant_number }, "nothing changes before a person accepts"

    sign_in_as users(:michael)
    get map_feature_updates_path(@map), as: :json
    batch = response.parsed_body["batches"].sole
    post accept_all_map_feature_updates_path(@map), params: { batch: batch["batch"], ids: response.parsed_body["updates"].map { |u| u["id"] } }, as: :json
    assert_response :success
    assert_empty response.parsed_body["failed"]
    assert_equal targets.values, trees.map { |t| t.reload.plant_number }
    assert_equal 5, outside.reload.plant_number
  end

  test "a plant renumbered alone swaps with the holder; two plants asking for one number are refused" do
    a, b, c = 3.times.map { |i| plant(i) }
    data, error = call_tool(personal_token(users(:michael)), "propose_feature_updates", {
      map_id: @map.id, updates: [ { feature_id: a.id, changes: { properties: { number: 2 } }, rationale: "Numéro de l'étiquette sur le terrain." } ]
    })
    refute error, data
    assert_equal({ "feature_id" => b.id, "takes_number" => 1 }, data["created"].sole["swaps_with"])

    sign_in_as users(:michael)
    post accept_map_feature_update_path(@map, data["created"].sole["id"]), as: :json
    assert_response :success
    assert_equal [ 2, 1, 3 ], [ a, b, c ].map { |p| p.reload.plant_number }

    data, = call_tool(personal_token(users(:michael)), "propose_feature_updates", {
      map_id: @map.id, updates: [ a, c ].map { |p| { feature_id: p.id, changes: { properties: { number: 7 } }, rationale: "Numéro de l'étiquette sur le terrain." } }
    })
    assert_match "numéro 7", data.to_s
    assert_equal 0, @map.feature_update_drafts.pending.count
  end
end
