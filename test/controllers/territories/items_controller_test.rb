require "test_helper"
require "test_helpers/territories_test_helper"

class Territories::ItemsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @member = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @member ])
    @team.grant_territory_module!
    @territory = make_territory(@team)
  end

  test "adds an entry to the dossier, with its place" do
    sign_in_as @member
    post territory_items_path(@territory), params: {
      kind: "marker", title: "Inondation, juillet 2021", geometry: inside_point.to_json,
      properties: { proof: "seen", occurred_on: "2021-07", owner: "x" }.to_json, tab: "marker"
    }
    assert_redirected_to territory_path(@territory, tab: "marker")
    item = @territory.items.last
    assert_equal [ "marker", "active", "human", @member ], [ item.kind, item.status, item.source, item.created_by ]
    assert_equal({ "proof" => "seen", "occurred_on" => "2021-07" }, item.properties)
    assert_equal "Point", item.geometry.geometry_type.type_name
  end

  test "changes an entry, merging its properties" do
    item = @territory.items.create!(kind: "lead", title: "Haie", properties: { rank: "slow", land: "public" })
    sign_in_as @member
    patch territory_item_path(@territory, item), params: { title: "Haie sur talus", properties: { keeper: { role: "Service travaux" } }.to_json, lock_version: item.lock_version }
    item.reload
    assert_equal "Haie sur talus", item.title
    assert_equal({ "rank" => "slow", "land" => "public", "keeper" => { "role" => "Service travaux" } }, item.properties)
    refute item.orphan?
  end

  test "keeps or rejects an AI's draft" do
    kept = @territory.items.create!(kind: "actor", title: "GISER", status: "draft", source: "ai", rationale: "Rend des avis.")
    rejected = @territory.items.create!(kind: "actor", title: "Doublon", status: "draft", source: "ai", rationale: "Trouvé en ligne.")
    sign_in_as @member
    post accept_territory_item_path(@territory, kept)
    post reject_territory_item_path(@territory, rejected)
    assert_equal [ "active", "rejected" ], [ kept.reload.status, rejected.reload.status ]
    assert_equal @member, kept.decided_by
  end

  test "attaches a copy of a source's file" do
    sign_in_as @member
    post territory_items_path(@territory), params: { kind: "source", title: "PCDN", properties: { rights: "open" }.to_json,
                                                     file: fixture_file_upload(Rails.root.join("test/fixtures/files").children.find(&:file?), "application/octet-stream") }
    item = @territory.items.last
    assert item.file.attached?
    get file_territory_item_path(@territory, item)
    assert_response :redirect
  end

  test "an outsider gets nothing; a read-only team changes nothing" do
    item = @territory.items.create!(kind: "actor", title: "GISER")
    sign_in_as users(:alice)
    delete territory_item_path(@territory, item)
    assert_response :not_found

    @team.revoke_territory_module!
    sign_in_as @member
    delete territory_item_path(@territory, item)
    assert TerritoryItem.exists?(item.id)
  end
end
