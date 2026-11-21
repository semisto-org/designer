require "test_helper"

class MasterPlanTest < ActiveSupport::TestCase
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze
  LINE = { "type" => "LineString", "coordinates" => [ [ 4.907, 50.341 ], [ 4.909, 50.341 ] ] }.freeze
  POINT = { "type" => "Point", "coordinates" => [ 4.9071, 50.3411 ] }.freeze

  setup { @map = maps(:ahinvaux) }

  test "the project is numbered theme by theme, water first; single plants are counted in the palette; networks never" do
    path = @map.features.create!(layer: "access", kind: "path", name: "Allée", geometry: LINE, properties: { "planned" => true })
    pond = @map.features.create!(layer: "water", kind: "pond", name: "Mare", geometry: SHAPE, properties: { "planned" => true })
    @map.features.create!(layer: "water", kind: "pond", name: "Mare existante", geometry: SHAPE)
    @map.features.create!(layer: "networks", kind: "water_pipe", name: "Conduite", geometry: LINE, properties: { "planned" => true })
    # A bubble was the sketch of an intention: the master plan shows what came of it.
    @map.features.create!(layer: "drawings", kind: "bubble", name: "Garder l'eau", geometry: SHAPE)
    apple = PlantSpecies.create!(latin_name: "Malus masterplanii", plant_type: "tree")
    2.times { @map.features.create!(layer: "plants", kind: "plant", geometry: POINT, properties: { "species_id" => apple.id }) }

    plan = MasterPlan.new(@map).as_json
    assert_equal %w[water access], plan[:themes].map { _1[:key] }
    assert_equal [ [ 1, pond.id, "Mare" ], [ 2, path.id, "Allée" ] ], plan[:themes].flat_map { |t| t[:items].map { _1.values_at(:number, :id, :label) } }
    lng, lat = plan[:themes].last[:items].first[:at]
    assert_in_delta 4.908, lng, 1e-6
    assert_in_delta 50.341, lat, 1e-6
    assert_equal [ [ apple.id, 2 ] ], plan[:palette].map { _1.values_at(:species_id, :count) }
    assert_equal "Phase 1", plan[:phase]
  end

  test "the mission is the team's purpose for the team, the person's words for anyone else" do
    @map.update!(project: { "ambitions" => { "meaning" => "Nourrir la famille" }, "analysis" => { "purpose" => "Un jardin-forêt nourricier et pédagogique" } })
    assert_equal "Un jardin-forêt nourricier et pédagogique", MasterPlan.new(@map, team: true).mission
    assert_equal "Nourrir la famille", MasterPlan.new(@map).mission
  end

  test "the plan of a variant numbers the common project and that variant, not the retained one" do
    one = @map.variants.create!(name: "Projet 1")
    two = @map.variants.create!(name: "Projet 2")
    first = @map.features.create!(layer: "water", kind: "pond", name: "Mare 1", geometry: SHAPE, variant: one, properties: { "planned" => true })
    second = @map.features.create!(layer: "water", kind: "pond", name: "Mare 2", geometry: SHAPE, variant: two, properties: { "planned" => true })
    ids = ->(plan) { plan[:themes].flat_map { |t| t[:items].map { _1[:id] } } }
    assert_includes ids.(MasterPlan.new(@map, variant: two).as_json), second.id
    assert_not_includes ids.(MasterPlan.new(@map, variant: two).as_json), first.id
  end
end
