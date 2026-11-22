require "test_helper"

class MapPhaseTest < ActiveSupport::TestCase
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze
  POINT = { "type" => "Point", "coordinates" => [ 4.9071, 50.3411 ] }.freeze

  setup do
    @map = maps(:ahinvaux)
    @user = users(:michael)
  end

  test "putting a phase away freezes the design, leaves the notes and opens the next phase" do
    pond = @map.features.create!(layer: "water", kind: "pond", name: "Mare", geometry: SHAPE, properties: { "planned" => true })
    barn = @map.features.create!(layer: "existing", kind: "building", geometry: SHAPE)
    @map.features.create!(layer: "notes", kind: "season_sign", geometry: POINT, properties: { "sign" => "nest" })
    @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, status: "draft")
    lock = @map.reload.lock_version

    phase = MapPhase.put_away!(@map, name: "Esquisse", notes: "Première idée", next_name: "Avant-projet", by: @user)

    assert_equal [ 1, "Esquisse", "Première idée" ], [ phase.number, phase.name, phase.notes ]
    kept = phase.snapshot.map { _1["id"] }
    assert_equal [ pond.id, barn.id ], kept.last(2)
    assert_equal @map.features.active.where.not(layer: "notes").count, kept.size
    assert_equal 1, phase.counts["planned"]
    assert_equal kept.size - 1, phase.counts["existing"]
    assert_equal "Avant-projet", @map.reload.current_design_phase_name
    assert_equal lock, @map.lock_version
  end

  test "without names, phases count themselves" do
    assert_equal "Phase 1", @map.current_design_phase_name
    first = MapPhase.put_away!(@map, name: nil)
    assert_equal "Phase 1", first.name
    assert_equal "Phase 2", @map.reload.current_design_phase_name
    assert_equal 2, MapPhase.put_away!(@map, name: "").number
  end

  test "compare tells what was drawn, removed and changed since" do
    kept = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
    moved = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
    gone = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
    phase = MapPhase.put_away!(@map, name: "Esquisse")

    moved.update!(name: "Mare haute")
    gone.trash!
    added = @map.features.create!(layer: "access", kind: "path", geometry: { "type" => "LineString", "coordinates" => [ [ 4.907, 50.341 ], [ 4.9072, 50.3412 ] ] })

    assert_equal({ added: [ added.id ], removed: [ gone.id ], changed: [ moved.id ] }, phase.compare)
    assert_includes phase.snapshot.map { _1["id"] }, kept.id
  end

  test "take puts a copy of an element of the phase back on the map" do
    gone = @map.features.create!(layer: "water", kind: "pond", name: "Mare du bas", geometry: SHAPE, tags: [ "eau" ], properties: { "planned" => true, "depth_m" => 1.2 })
    phase = MapPhase.put_away!(@map, name: "Esquisse")
    gone.trash!

    copy = phase.take!(gone.id, by: @user)
    assert_not_equal gone.id, copy.id
    assert_equal [ "water", "pond", "Mare du bas", [ "eau" ], "active", "human" ], [ copy.layer, copy.kind, copy.name, copy.tags, copy.status, copy.source ]
    assert_equal({ "planned" => true, "depth_m" => 1.2 }, copy.properties.slice("planned", "depth_m"))
    assert_nil copy.properties["id"]
    assert_raises(ActiveRecord::RecordNotFound) { phase.take!(0) }
  end

  test "a tree taken back is the idea, not the tree that was planted" do
    variant = @map.variants.create!(name: "Projet 1")
    apple = PlantSpecies.create!(latin_name: "Malus phasetestii", plant_type: "tree")
    pear = PlantSpecies.create!(latin_name: "Pyrus phasetestii", plant_type: "tree")
    tree = @map.features.create!(layer: "plants", kind: "plant", geometry: POINT, variant:,
      properties: { "species_id" => apple.id, "planted_on" => "2025-11-20", "measured_on" => "2026-06-01", "height_m" => 2.4, "water_source_id" => 99 })
    phase = MapPhase.put_away!(@map, name: "Plantation")
    tree.trash!

    idea = @map.features.create!(layer: "plants", kind: "plant", geometry: POINT, variant:, properties: { "species_id" => pear.id })
    assert_equal variant, phase.reload.map.features.find(idea.id).variant
    later = MapPhase.put_away!(@map, name: "Variante")
    idea.trash!
    assert_equal variant, later.take!(idea.id).variant

    copy = phase.take!(tree.id)
    assert_equal apple.id, copy.properties["species_id"]
    assert_nil copy.properties["planted_on"]
    assert_nil copy.properties["measured_on"]
    assert_nil copy.properties["height_m"]
    assert_nil copy.properties["water_source_id"]
    assert copy.planned?
  end

  test "a phase keeps every designer's sketch, pencil strokes included, and compares one at a time" do
    julie = @map.variants.create!(name: "Esquisse de Julie", created_by: @user)
    mine = @map.variants.create!(name: "Esquisse de Michael")
    julie_pond = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true }, variant: julie)
    stroke = @map.features.create!(layer: "notes", kind: "sketch", geometry: { "type" => "LineString", "coordinates" => [ [ 4.907, 50.341 ], [ 4.9072, 50.3412 ] ] }, variant: mine)
    common = @map.features.create!(layer: "access", kind: "path", geometry: { "type" => "LineString", "coordinates" => [ [ 4.907, 50.341 ], [ 4.9071, 50.3411 ] ] }, properties: { "planned" => true })
    visit_note = @map.features.create!(layer: "notes", kind: "note", geometry: POINT)

    phase = MapPhase.put_away!(@map, name: "Esquisses").reload
    kept = phase.snapshot.map { _1["id"] }
    assert_includes kept, julie_pond.id
    assert_includes kept, stroke.id
    assert_not_includes kept, visit_note.id
    assert_equal [ [ "Esquisse de Julie", true, "Michael", 1 ], [ "Esquisse de Michael", false, nil, 1 ] ],
      phase.variants.map { [ _1["name"], _1["retained"], _1["author"], _1["own"] ] }
    # The counts are the project the map counted then: the retained sketch.
    assert_equal 2, phase.counts["planned"]

    assert_equal julie.id, phase.retained_variant_id
    assert_equal [ julie_pond.id, common.id ].sort, (phase.features_of(julie.id).map { _1["id"] } & [ julie_pond.id, common.id, stroke.id ]).sort
    assert_includes phase.features_of(mine.id).map { _1["id"] }, stroke.id

    stroke.trash!
    assert_equal [ stroke.id ], phase.compare(variant_id: mine.id)[:removed]
    assert_empty phase.compare[:removed]
  end
end
