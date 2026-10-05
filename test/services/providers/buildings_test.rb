require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::BuildingsTest < ActiveSupport::TestCase
  include MapDataTestHelper

  BOX = { south: 50.3398, west: 4.8995, north: 50.3403, east: 4.9005 }.freeze

  def overpass_answer
    square = ->(lng, lat) { [ [ lng, lat ], [ lng + 0.0001, lat ], [ lng + 0.0001, lat + 0.0001 ], [ lng, lat + 0.0001 ], [ lng, lat ] ].map { |x, y| { "lon" => x, "lat" => y } } }
    { "elements" => [
      { "type" => "way", "id" => 11, "tags" => { "building" => "house", "building:levels" => "2" }, "geometry" => square.call(4.9, 50.34) },
      { "type" => "way", "id" => 12, "tags" => { "building" => "yes", "height" => "7,5 m", "min_height" => "2" }, "geometry" => square.call(4.9002, 50.34) },
      { "type" => "way", "id" => 13, "tags" => { "building" => "construction" }, "geometry" => square.call(4.9003, 50.34) },
      { "type" => "way", "id" => 14, "tags" => { "building" => "shed", "height" => "12 ft" }, "geometry" => square.call(4.9004, 50.34)[0, 3] },
      { "type" => "relation", "id" => 21, "tags" => { "building" => "barn", "type" => "multipolygon" }, "members" => [
        { "type" => "way", "role" => "outer", "geometry" => square.call(4.9001, 50.3401) },
        { "type" => "way", "role" => "inner", "geometry" => square.call(4.90012, 50.34012) }
      ] }
    ] }.to_json
  end

  test "overpass by default: footprints with their tagged heights" do
    stub = stub_request(:get, %r{\Ahttps://overpass-api\.de/api/interpreter})
      .with(query: hash_including("data" => /way\["building"\]\(50\.3398,4\.8995,50\.3403,4\.9005\)/))
      .to_return(status: 200, body: overpass_answer, headers: { "Content-Type" => "application/json" })
    provider = Providers::Buildings.build({})
    assert provider.available?

    buildings = provider.within(**BOX)
    assert_requested stub
    assert_equal %w[w11 w12 r21], buildings.map(&:id)
    house, tall, barn = buildings
    assert_equal 2, house.levels
    assert_nil house.height
    assert_equal 5, house.rings.first.size
    assert_equal [ 4.9, 50.34 ], house.rings.first.first
    assert_equal 7.5, tall.height
    assert_equal 2.0, tall.min_height
    assert_equal "barn", barn.kind
    assert_equal 1, barn.rings.size, "inner rings are left out"
    assert_equal({ id: "w12", kind: "yes", rings: tall.rings, height: 7.5, minHeight: 2.0, levels: nil }, tall.as_json)
  end

  test "answers are cached per extent" do
    with_memory_cache do
      stub = stub_request(:get, %r{overpass}).to_return(status: 200, body: overpass_answer)
      provider = Providers::Buildings.build("OVERPASS_URL" => "https://overpass.example.org/api/interpreter")
      2.times { assert_equal 3, provider.within(**BOX).size }
      assert_requested stub, times: 1
    end
  end

  test "down or switched off: unavailable" do
    stub_request(:get, %r{overpass}).to_return(status: 504)
    assert_raises(Providers::Buildings::Unavailable) { Providers::Buildings.build({}).within(**BOX) }

    off = Providers::Buildings.build("BUILDINGS_PROVIDER" => "none")
    assert_not off.available?
    assert_raises(Providers::Buildings::Unavailable) { off.within(**BOX) }
  end

  test "a city-sized extent is refused without asking" do
    assert_raises(Providers::Buildings::Unavailable) do
      Providers::Buildings.build({}).within(south: 50.0, west: 4.0, north: 50.5, east: 4.5)
    end
  end
end
