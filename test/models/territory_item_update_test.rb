require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoryItemUpdateTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Semisto", admin: users(:michael))
    @team.grant_territory_module!
    @territory = make_territory(@team)
    @lead = @territory.items.create!(kind: "lead", title: "Haie sur talus", properties: { rank: "slow", land: "unknown", magnitude: "≈ 300 m", keeper: { role: "Commune", hours_per_year: 6 } })
  end

  def propose(item, changes)
    normalized, error = TerritoryItemUpdate.normalize(item, changes)
    raise error if error
    @territory.item_updates.create!(territory_item: item, item_title: item.title, batch: "b", proposed_changes: normalized, rationale: "Le propriétaire est connu.")
  end

  test "normalize keeps only what differs, cleaned by the entry's schema" do
    changes, error = TerritoryItemUpdate.normalize(@lead, { title: "Haie sur talus", properties: { land: "public", keeper: { role: "Commune", hours_per_year: "12" }, magnitude: nil } })
    assert_nil error
    assert_equal({ "properties" => { "land" => "public", "keeper" => { "hours_per_year" => 12 }, "magnitude" => nil } }, changes)

    _, error = TerritoryItemUpdate.normalize(@lead, { properties: { owner_name: "Dupont" } })
    assert_match(/owner_name/, error)
    _, error = TerritoryItemUpdate.normalize(@lead, { kind: "marker" })
    assert_match(/kind/, error)
  end

  test "a person accepts some fields only; the others stay as they were" do
    update = propose(@lead, { title: "Haie sur talus communal", properties: { land: "public", keeper: { hours_per_year: 12 }, magnitude: nil } })
    assert_equal %w[title properties.land properties.keeper.hours_per_year properties.magnitude], update.diff.map { _1[:field] }

    update.accept!(users(:michael), fields: %w[properties.land properties.keeper.hours_per_year properties.magnitude])
    @lead.reload
    assert_equal "Haie sur talus", @lead.title
    assert_equal({ "rank" => "slow", "land" => "public", "keeper" => { "role" => "Commune", "hours_per_year" => 12 } }, @lead.properties)
    assert_equal [ "accepted", users(:michael) ], [ update.status, update.reviewed_by ]
    assert_equal({ "properties.land" => "unknown", "properties.keeper.hours_per_year" => 6, "properties.magnitude" => "≈ 300 m" }, update.previous_values)
    assert_raises(ArgumentError) { propose(@lead, { title: "Autre" }).accept!(users(:michael), fields: []) }
  end

  test "an accepted removal deletes the entry and keeps the proposal as history" do
    update = @territory.item_updates.create!(territory_item: @lead, item_title: @lead.title, batch: "b", proposed_changes: TerritoryItemUpdate::DELETION, rationale: "Doublon de la haie du vallon.")
    update.accept!(users(:michael))
    refute TerritoryItem.exists?(@lead.id)
    update.reload
    assert_equal [ "accepted", nil, "Haie sur talus" ], [ update.status, update.territory_item_id, update.item_title ]
  end
end
