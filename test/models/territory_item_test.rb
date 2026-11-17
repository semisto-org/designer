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
                   "seen_on_site" => true, "expectation_ids" => [ 3 ] }, item.properties.except("verification", "verified_on", "seen_on"))
    assert_equal "site", item.prop(:verification)
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
    assert lead.waiting_for_farmer?, "land nobody named yet waits like farmland"
    assert lead(land: "unknown").waiting_for_farmer?
  end

  test "a soil practice on farmland does not wait for the farmer" do
    soil = lead(land: "agricultural", rank: "soil")
    assert soil.soil_practice?
    refute soil.waiting_for_farmer?
    refute lead(land: "public", rank: "soil").soil_practice?
    assert lead(rank: "soil").soil_practice?, "unknown land counts as farmland"
  end

  test "a marker or a lead points to a sub-basin of its own territory" do
    basin = @territory.items.create!(kind: "basin", title: "Vallon du Bocq", properties: { order: "1", outlet: "le Bocq" }, geometry: commune_square(size: 0.02))
    assert_equal({ "order" => 1, "outlet" => "le Bocq", "verification" => "desk" }, basin.properties)
    assert @territory.items.create(kind: "marker", title: "Coulée", properties: { basin_id: basin.id }).persisted?

    other = make_territory(make_team("Autre", admin: users(:michael)))
    stray = other.items.create(kind: "lead", title: "Haie", properties: { basin_id: basin.id })
    assert stray.errors.include?(:properties)
    refute @territory.items.new(kind: "basin", title: "Point", geometry: inside_point).valid?, "a sub-basin is an area"
  end

  test "accept and reject record who decided" do
    item = @territory.items.create!(kind: "expectation", title: "Haies", status: "draft", source: "ai", rationale: "Tiré du PCDN.")
    item.accept!(users(:michael))
    assert_equal [ "active", users(:michael) ], [ item.status, item.decided_by ]
    assert item.decided_at
  end

  test "a source keeps its excerpts as a list, even when they come as one text" do
    source = @territory.items.create!(kind: "source", title: "PCDN", properties: { excerpts: [ " Une haie. ", "", 3 ] })
    assert_equal [ "Une haie.", "3" ], source.prop(:excerpts)
    source.update!(properties: { excerpts: "Premier extrait.\n\nSecond extrait." })
    assert_equal [ "Premier extrait.", "Second extrait." ], source.prop(:excerpts)
    source.update!(properties: { excerpts: '["A", "B"]' })
    assert_equal %w[A B], source.prop(:excerpts)
  end

  test "a request says what to obtain, from whom, and where it stands" do
    giser = @territory.items.create!(kind: "actor", title: "Cellule GISER")
    request = @territory.items.create!(kind: "request", title: "Avis sur la coulée de 2021", properties: { request_kind: "document", actor_id: giser.id, state: "asked", asked_on: "2026-11-02", from: "GISER" })
    assert_equal({ "request_kind" => "document", "actor_id" => giser.id, "state" => "asked", "asked_on" => "2026-11-02", "from" => "GISER" }, request.properties)
    refute @territory.items.new(kind: "request", title: "Inventaire", properties: { actor_id: request.id }).valid?, "actor_id points to an actor"
  end

  test "an entry that leaves the dossier is no longer pointed to" do
    basin = @territory.items.create!(kind: "basin", title: "Vallon du Bocq")
    source = @territory.items.create!(kind: "source", title: "Presse")
    marker = @territory.items.create!(kind: "marker", title: "Coulée", properties: { basin_id: basin.id, source_ids: [ source.id ] })
    basin.destroy!
    source.reject!(users(:michael))
    assert_equal({ "verification" => "desk", "proof" => "computed" }, marker.reload.properties)
    assert marker.update(title: "Coulée de boue")
  end

  # --- verification (Michael, 2026-11-16) ---

  def actor(title = "Cellule GISER")
    @territory.items.create!(kind: "actor", title:)
  end

  test "every claim starts at the desk; actors and sources carry no level" do
    assert_equal "desk", lead.verification_level
    assert_equal "desk", lead.properties["verification"]
    assert_nil actor.verification_level
    refute actor.properties.key?("verification")
  end

  test "confirmed by an actor says who and when, today by default" do
    giser = actor
    item = lead(verification: "actor", verified_by_id: giser.id)
    assert_equal "actor", item.verification_level
    assert_equal Date.current.iso8601, item.prop(:verified_on)
    assert_equal "Cellule GISER", item.verifier_name
    assert item.confirmed?

    nobody = @territory.items.new(kind: "lead", title: "Fascine", properties: { verification: "actor" })
    refute nobody.valid?
    assert nobody.errors.of_kind?(:properties, :verifier_missing)
    assert @territory.items.new(kind: "lead", title: "Fascine", properties: { verification: "actor", verified_by: "M. Lambert, agriculteur" }).valid?
  end

  test "the verifier and the actor to ask are actors of this dossier" do
    other = make_territory(@team, name: "Profondeville").items.create!(kind: "actor", title: "Contrat de rivière")
    item = @territory.items.new(kind: "marker", title: "Inondation", properties: { confirm_with_id: other.id })
    refute item.valid?
    assert item.errors.of_kind?(:properties, :confirm_with)
  end

  test "a lead seen on site and its level follow each other" do
    item = lead(seen_on_site: true, seen_on: "2026-10-02")
    assert_equal "site", item.prop(:verification)
    assert_equal "2026-10-02", item.prop(:verified_on)

    item.update!(properties: item.properties.merge("verification" => "desk"))
    refute item.seen_on_site?
    assert_nil item.prop(:verified_on)

    item.update!(properties: item.properties.merge("verification" => "site", "verified_by" => "Marie", "verified_on" => "2026-11-12"))
    assert item.seen_on_site?
    assert_equal "2026-11-12", item.prop(:seen_on)
  end

  test "a marker's proof and its level follow each other" do
    item = @territory.items.create!(kind: "marker", title: "Coulée", properties: { proof: "seen" })
    assert_equal "site", item.prop(:verification)
    item.update!(properties: item.properties.merge("verification" => "actor", "verified_by" => "Riverain"))
    assert_equal "confirmed", item.prop(:proof)
    item.update!(properties: item.properties.merge("proof" => "computed"))
    assert_equal "desk", item.prop(:verification)
  end

  test "confirmed by the actor it waited for, it leaves that actor's list" do
    giser = actor
    item = lead(confirm_with_id: giser.id, confirm_question: "Le talus déborde-t-il ?")
    item.update!(properties: item.properties.merge("verification" => "actor", "verified_by_id" => giser.id))
    assert_nil item.prop(:confirm_with_id)
    assert_nil item.prop(:confirm_question)
  end

  test "an actor removed from the dossier no longer verifies nor waits" do
    giser = actor
    item = lead(verification: "actor", verified_by_id: giser.id, confirm_with_id: actor("Contrat de rivière").id)
    giser.reject!(users(:michael))
    refute item.reload.properties.key?("verified_by_id")
  end
end
