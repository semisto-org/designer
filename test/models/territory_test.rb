require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoryTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @team.grant_territory_module!
  end

  test "derives its centre, area and region from the commune's boundary" do
    territory = make_territory(@team)
    assert_equal "MultiPolygon", territory.boundary.geometry_type.type_name
    assert_in_delta 19.7, territory.area_m2 / 1_000_000, 1.5 # 0.05° × 0.05° at 50° N
    assert territory.boundary.contains?(territory.center)
    assert_equal regions(:wallonia), territory.region
  end

  test "refuses a boundary larger than any commune" do
    territory = @team.territories.new(name: "Trop grand", boundary: commune_square(size: 0.5))
    refute territory.valid?
    assert territory.errors.of_kind?(:boundary, :too_large)
  end

  test "members read it; they change it while the module is granted and it is not archived" do
    territory = make_territory(@team)
    assert territory.editable_by?(users(:bob))
    refute territory.viewable_by?(users(:alice))
    refute territory.editable_by?(users(:alice))

    territory.archive!
    assert territory.viewable_by?(users(:bob))
    refute territory.editable_by?(users(:bob))

    territory.unarchive!
    @team.revoke_territory_module!
    assert territory.reload.viewable_by?(users(:bob))
    refute territory.editable_by?(users(:bob))
  end

  test "lists the team's maps that lie in the commune, not others" do
    territory = make_territory(@team)
    inside = maps(:ahinvaux)
    inside.update!(organization: @team, boundary: square(lng: 4.89, lat: 50.32))
    assert_equal [ inside ], territory.team_maps.to_a
    inside.update!(boundary: square(lng: 5.5, lat: 50.6))
    assert_empty territory.team_maps.to_a
  end

  test "never offers sensitive layers" do
    region = regions(:wallonia)
    region.layers.create!(key: "reseau_gaz", name: "Gaz", group_name: "réseaux", category: "overlay", kind: "wms", url: "https://example.org/wms", layers: "gaz")
    region.layers.create!(key: "sols", name: "Sols", group_name: "terrain", category: "overlay", kind: "wms", url: "https://example.org/wms", layers: "sols")
    keys = make_territory(@team).readable_layers.map(&:key)
    assert_includes keys, "sols"
    refute_includes keys, "reseau_gaz"
  end

  test "the research grid comes from the region, else from europe" do
    regions(:wallonia).update!(settings: { "territory" => { "research_grid" => [ { "topic" => "GISER" } ] } })
    assert_equal [ { "topic" => "GISER" } ], make_territory(@team).research_grid
  end
end
