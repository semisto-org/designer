require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoryItemTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Semisto", admin: users(:michael))
    @team.grant_territory_module!
    @territory = make_territory(@team)
  end

  def lead(**properties)
    @territory.items.create!(kind: "lead", title: "Haie sur talus", properties:)
  end

  test "keeps only the properties its kind knows, with their types" do
    item = lead(rank: "soil", land: "agricultural", nonsense: "x", keeper: { role: " Agent travaux ", hours_per_year: "12", owner_name: "Dupont" },
                seen_on_site: "true", expectation_ids: [ "3", "x" ], decision: { status: "maybe" })
    assert_equal({ "rank" => "soil", "land" => "agricultural", "keeper" => { "role" => "Agent travaux", "hours_per_year" => 12 },
                   "seen_on_site" => true, "expectation_ids" => [ 3 ] }, item.properties)
  end

  test "a source keeps a web link only" do
    item = @territory.items.create!(kind: "source", title: "PCDN", properties: { url: "javascript:alert(1)", rights: "open" })
    assert_equal({ "rights" => "open" }, item.properties)
  end

  test "an AI's draft needs its rationale" do
    item = @territory.items.new(kind: "actor", title: "GISER", status: "draft", source: "ai")
    refute item.valid?
    item.rationale = "Rend des avis après les coulées."
    assert item.valid?
  end

  test "a marker is a point near the territory; a source has no place" do
    assert @territory.items.new(kind: "marker", title: "Inondation", geometry: inside_point).valid?
    far = @territory.items.new(kind: "marker", title: "Ailleurs", geometry: { "type" => "Point", "coordinates" => [ 5.9, 50.6 ] })
    refute far.valid?
    assert far.errors.of_kind?(:geometry, :outside)
    refute @territory.items.new(kind: "source", title: "Plan", geometry: inside_point).valid?
  end

  test "a lead without keeper is orphan" do
    assert lead.orphan?
    refute lead(keeper: { role: "Service travaux" }).orphan?
  end

  test "a lead is sharp on public land or once the farmer said yes, fuzzy otherwise" do
    assert lead(land: "public").sharp?
    refute lead(land: "agricultural").sharp?
    refute lead(land: "private", farmer: { answer: "thinking" }).sharp?
    assert lead(land: "agricultural", farmer: { answer: "yes" }).sharp?
  end

  test "a lead on farmland waits for the farmer's contact and answer" do
    assert lead(land: "agricultural").waiting_for_farmer?
    assert lead(land: "agricultural", farmer: { contacted_on: "2026-11-02" }).waiting_for_farmer?
    refute lead(land: "agricultural", farmer: { contacted_on: "2026-11-02", answer: "no" }).waiting_for_farmer?
    refute lead(land: "public").waiting_for_farmer?
  end

  test "accept and reject record who decided" do
    item = @territory.items.create!(kind: "expectation", title: "Haies", status: "draft", source: "ai", rationale: "Tiré du PCDN.")
    item.accept!(users(:michael))
    assert_equal [ "active", users(:michael) ], [ item.status, item.decided_by ]
    assert item.decided_at
  end
end
