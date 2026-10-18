require "test_helper"
require "test_helpers/mcp_test_helper"

# propose_deletions: an AI proposes to remove elements already on the map,
# a person reviews it; an accepted deletion goes to the trash.
class McpDeletionsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @tree = @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", properties: { "species_id" => plant_species(:apple).id },
      geometry: point(lng: 4.9062, lat: 50.3412))
    @pond = @map.features.create!(layer: "water", kind: "pond", name: "Mare", geometry: {
      "type" => "Polygon", "coordinates" => [ [ [ 4.9063, 50.3413 ], [ 4.9064, 50.3413 ], [ 4.9064, 50.3414 ], [ 4.9063, 50.3413 ] ] ]
    })
  end

  def rationale = "Le pommier est mort cet hiver, d'après Michael."

  def propose(ids, **extra)
    call_tool(@owner, "propose_deletions", { map_id: @map.id, feature_ids: ids, rationale: }.merge(extra))
  end

  test "proposes deletions for review: nothing leaves the map before a person accepts" do
    data, error = propose([ @tree.id, @pond.id ], summary: "Ménage d'automne")
    refute error, data
    assert_equal [ @tree.id, @pond.id ], data["created"].map { |c| c["feature_id"] }
    assert_equal [ "plants", "plant", "Pommier" ], data["created"].first.values_at("layer", "kind", "name")
    assert_equal 2, data["pending_update_drafts"]
    assert_match(/corbeille/, data["next_step"])
    assert @map.features.exists?(@tree.id), "nothing is deleted yet"

    draft = FeatureUpdateDraft.find(data["created"].first["id"])
    assert draft.deletion?
    assert_equal [ "pending", "Ménage d'automne", FeatureUpdateDraft::DELETION ], [ draft.status, draft.summary, draft.proposed_changes ]

    feature, = call_tool(@owner, "get_feature", { map_id: @map.id, feature_id: @tree.id })
    assert_equal true, feature["pending_update"]["deletion"]
    assert_equal [ { "field" => "delete", "before" => nil, "after" => true } ], feature["pending_update"]["changes"]

    assert_equal [ @tree.id, @pond.id ], AiAction.where(tool: "propose_deletions").sole.result["feature_ids"]
  end

  test "refuses what cannot be deleted, and does not propose twice" do
    draft = @map.features.create!(layer: "plants", kind: "tree", status: "draft", source: "ai", rationale: "x" * 12, geometry: point)
    pipe = @map.features.create!(layer: "networks", kind: "water_pipe", geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.3401 ], [ 4.906, 50.3401 ] ] })

    data, error = propose([ @tree.id, draft.id, pipe.id, 999_999 ])
    refute error, data
    assert_equal [ @tree.id ], data["created"].map { |c| c["feature_id"] }
    reasons = data["rejected"].to_h { |r| [ r["feature_id"], r["error"] ] }
    assert_match(/withdraw_draft/, reasons[draft.id])
    assert_match(/réseaux/, reasons[pipe.id])
    assert_match(/n'existe pas/, reasons[999_999])

    data, error = propose([ @tree.id ])
    refute error, data
    assert_empty data["created"]
    assert_match(/attend déjà/, data["unchanged"].sole["reason"])

    text, error = propose([ 999_999 ])
    assert error
    assert_match(/Aucune modification proposée/, text)
  end

  test "replaces a pending change of the element, and withdraw_draft withdraws a proposed deletion" do
    change = @map.feature_update_drafts.create!(map_feature: @tree, batch: "b", proposed_changes: { "notes" => "Taillé" }, rationale:)
    data, = propose([ @tree.id ])
    assert_equal change.id, data["created"].sole["replaces"]
    assert_equal "withdrawn", change.reload.status

    data, error = call_tool(@owner, "withdraw_draft", { map_id: @map.id, update_ids: [ data["created"].sole["id"] ] })
    refute error, data
    assert_equal 0, data["pending_update_drafts"]
  end

  test "only editors with the drafts access can propose deletions" do
    text, error = call_tool(personal_token(users(:alice)), "propose_deletions", { map_id: @map.id, feature_ids: [ @tree.id ], rationale: })
    assert error
    assert_match(/propriétaire et les éditeurs/, text)

    text, error = call_tool(personal_token(users(:michael), access: "read"), "propose_deletions", { map_id: @map.id, feature_ids: [ @tree.id ], rationale: })
    assert error
    assert_match(/lecture/, text)
    assert @map.features.exists?(@tree.id)
  end

  test "accepting puts the element in the trash, where « Annuler » restores it; refusing keeps it" do
    data, = propose([ @tree.id, @pond.id ])
    tree_draft, pond_draft = data["created"].map { |c| c["id"] }
    sign_in_as users(:michael)

    get map_feature_updates_path(@map), as: :json
    update = response.parsed_body["updates"].find { |u| u["id"] == tree_draft }
    assert_equal({ "delete" => true }, update["proposedChanges"])

    post accept_map_feature_update_path(@map, tree_draft), as: :json
    assert_response :success
    assert_equal({ "id" => tree_draft, "deletedId" => @tree.id }, response.parsed_body)
    assert_not @map.features.exists?(@tree.id)
    assert MapFeature.trashed.find(@tree.id).trashed?
    assert_equal users(:michael), MapFeature.trashed.find(@tree.id).updated_by

    post restore_map_feature_path(@map, @tree), as: :json
    assert_response :success
    assert @map.features.exists?(@tree.id)
    get map_feature_updates_path(@map, feature_id: @tree.id), as: :json
    entry = response.parsed_body["history"].sole
    assert_equal [ "accepted", [ { "field" => "delete", "before" => nil, "after" => true } ] ], entry.values_at("status", "changes")

    post reject_map_feature_update_path(@map, pond_draft), as: :json
    assert_response :success
    assert @map.features.exists?(@pond.id)
  end

  test "« Tout supprimer » trashes the whole proposal and names the deleted elements" do
    data, = propose([ @tree.id, @pond.id ])
    sign_in_as users(:michael)
    post accept_all_map_feature_updates_path(@map), params: { batch: data["batch"], ids: data["created"].map { |c| c["id"] } }, as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal [ [], [ @tree.id, @pond.id ], [] ], [ body["features"], body["deletedIds"].sort, body["failed"] ]
    assert_equal 0, @map.features.where(id: [ @tree.id, @pond.id ]).count

    get map_ai_actions_path(@map), as: :json
    action = response.parsed_body["actions"].find { |a| a["tool"] == "propose_deletions" }
    assert_equal({ "active" => 2 }, action["outcome"])
  end
end
