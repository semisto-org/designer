require "test_helper"
require "test_helpers/territories_test_helper"

class Territories::ItemUpdatesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @member = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @member ])
    @team.grant_territory_module!
    @territory = make_territory(@team)
    @lead = @territory.items.create!(kind: "lead", title: "Haie", properties: { land: "unknown" })
  end

  def proposal(changes)
    @territory.item_updates.create!(territory_item: @lead, item_title: @lead.title, batch: "b", proposed_changes: changes, rationale: "Le propriétaire est connu.")
  end

  test "accepts the chosen fields of a proposed change" do
    update = proposal({ "title" => "Haie communale", "properties" => { "land" => "public" } })
    sign_in_as @member
    post accept_territory_item_update_path(@territory, update), params: { fields: [ "properties.land" ], tab: "lead" }
    assert_redirected_to territory_path(@territory, tab: "lead")
    assert_equal [ "Haie", "public" ], [ @lead.reload.title, @lead.prop(:land) ]
    assert_equal "accepted", update.reload.status
  end

  test "rejects a proposed change, and accepts a proposed removal" do
    sign_in_as @member
    update = proposal({ "title" => "Autre" })
    post reject_territory_item_update_path(@territory, update)
    assert_equal [ "rejected", "Haie" ], [ update.reload.status, @lead.reload.title ]

    removal = proposal(TerritoryItemUpdate::DELETION)
    post accept_territory_item_update_path(@territory, removal)
    refute TerritoryItem.exists?(@lead.id)
  end

  test "the show page carries each entry's pending change; an outsider cannot decide" do
    update = proposal({ "properties" => { "land" => "public" } })
    sign_in_as @member
    get territory_path(@territory), headers: inertia_headers
    lead = response.parsed_body["props"]["items"].find { _1["id"] == @lead.id }
    assert_equal [ { "field" => "properties.land", "before" => "unknown", "after" => "public" } ], lead["pendingUpdate"]["changes"]

    sign_in_as users(:alice)
    post accept_territory_item_update_path(@territory, update)
    assert_response :not_found
    assert_equal "pending", update.reload.status
  end
end
