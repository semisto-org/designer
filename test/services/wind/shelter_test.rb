require "test_helper"

class Wind::ShelterTest < ActiveSupport::TestCase
  # Metres to degrees around the test map (50.34 N).
  M_LAT = 1 / 111_320.0
  M_LNG = 1 / (111_320.0 * Math.cos(50.34 * Math::PI / 180))

  setup do
    @map = maps(:ahinvaux)
    @tree = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.905, lat: 50.34),
                                  properties: { "species_id" => plant_species(:apple).id })
  end

  def hedge_west_of_tree(metres, height: nil)
    x = 4.905 - metres * M_LNG
    props = height ? { "height_m" => height } : {}
    @map.features.create!(layer: "structures", kind: "hedge", name: "Haie champêtre", properties: props,
                          geometry: { "type" => "LineString", "coordinates" => [ [ x, 50.34 - 20 * M_LAT ], [ x, 50.34 + 20 * M_LAT ] ] })
  end

  def sector(type, from, to, season: "all_year")
    @map.features.create!(layer: "notes", kind: "sector", name: "Vents d'ouest",
                          properties: { "sector_type" => type, "sector_season" => season, "from_deg" => from, "to_deg" => to },
                          geometry: { "type" => "LineString", "coordinates" => [ [ 4.90, 50.33 ], [ 4.91, 50.33 ] ] })
  end

  test "a hedge on the windward side within ten times its height shelters the tree from that wind" do
    sector("wind", 225, 315)
    sector("cold_wind", 20, 100, season: "spring")
    hedge = hedge_west_of_tree(12, height: 2)
    winds = Wind::Shelter.new(@map, climate: {}).for(@tree)[:winds]

    west = winds.find { _1[:type] == "wind" }
    assert_equal "sector", west[:source]
    assert_equal({ id: hedge.id, name: "Haie champêtre", kind: "hedge", height_m: 2.0, distance_m: 12.0, reach_m: 20 }, west[:shelter])
    east = winds.find { _1[:type] == "cold_wind" }
    assert_equal "spring", east[:season]
    assert_nil east[:shelter], "a hedge to the west does not stop the bise"
  end

  test "beyond its reach, or with the default height, the hedge no longer counts" do
    sector("wind", 225, 315)
    hedge_west_of_tree(35) # a hedge is 3 m high by default: 30 m of shelter
    assert_nil Wind::Shelter.new(@map, climate: {}).for(@tree)[:winds].sole[:shelter]
  end

  test "without wind sectors, the observed climate's prevailing and cold spring winds" do
    climate = { "wind" => { "year" => { "prevailing_deg" => 247.5 }, "cold_spring" => { "prevailing_deg" => 45.0, "hours_pct" => 6.2 } } }
    hedge_west_of_tree(8)
    winds = Wind::Shelter.new(@map, climate:).for(@tree)[:winds]
    assert_equal [ [ "wind", 213.75, 281.25, "climate" ], [ "cold_wind", 11.25, 78.75, "climate" ] ], winds.map { [ _1[:type], _1[:from_deg], _1[:to_deg], _1[:source] ] }
    assert winds.first[:shelter]
    assert_nil winds.last[:shelter]
  end

  test "only trees and shrubs; trees listed for the AI with what shelters them" do
    sector("wind", 225, 315)
    hedge_west_of_tree(10)
    comfrey = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9051, lat: 50.34), properties: { "species_id" => plant_species(:comfrey).id })
    shelter = Wind::Shelter.new(@map, climate: {})
    assert_nil shelter.for(comfrey)

    trees = shelter.trees
    assert_equal 1, trees[:count]
    tree = trees[:trees].sole
    assert_equal @tree.id, tree[:id]
    assert_equal "Haie champêtre", tree[:sheltered].sole[:by]
    assert_empty tree[:exposed]
  end
end
