require "test_helper"

class Providers::CommuneBoundariesTest < ActiveSupport::TestCase
  NOMINATIM = "https://nominatim.openstreetmap.org".freeze

  setup do
    Rails.cache.clear
    @communes = Providers::CommuneBoundaries.build({})
  end

  def row(**overrides)
    { "osm_type" => "relation", "osm_id" => 2268384, "lat" => "50.326", "lon" => "4.8778", "category" => "boundary", "type" => "administrative",
      "place_rank" => 14, "addresstype" => "village", "name" => "Yvoir",
      "display_name" => "Yvoir, Dinant, Namur, Wallonie, 5530, Belgique",
      "boundingbox" => [ "50.28", "50.36", "4.85", "5.02" ] }.merge(overrides)
  end

  test "finds communes by name, leaving out sections and other places" do
    stub_request(:get, "#{NOMINATIM}/search").with(query: hash_including(q: "Yvoir", countrycodes: "be,fr"))
      .to_return(json_response([ row, row("osm_id" => 18215478, "place_rank" => 16, "addresstype" => "city_district"), row("category" => "place", "type" => "village") ]))
    candidates = @communes.search("Yvoir", countries: %w[FR BE])
    assert_equal [ "R2268384" ], candidates.map(&:id)
    assert_equal "Dinant, Namur, Wallonie, Belgique", candidates.first.detail
    assert_equal [ 4.85, 50.28, 5.02, 50.36 ], candidates.first.bbox
  end

  test "fetches a commune's boundary by its id" do
    polygon = { "type" => "Polygon", "coordinates" => [ [ [ 4.85, 50.28 ], [ 5.0, 50.28 ], [ 5.0, 50.36 ], [ 4.85, 50.28 ] ] ] }
    stub_request(:get, "#{NOMINATIM}/lookup").with(query: hash_including(osm_ids: "R2268384", polygon_geojson: "1"))
      .to_return(json_response([ row("geojson" => polygon) ]))
    boundary = @communes.fetch("r2268384")
    assert_equal [ "Yvoir", polygon, "nominatim" ], [ boundary.name, boundary.geometry, boundary.provider ]
    assert_match(/ODbL/, boundary.licence)
  end

  test "an id that is not an OSM relation or way is not found" do
    assert_raises(Providers::CommuneBoundaries::NotFound) { @communes.fetch("N1; DROP") }
  end

  test "a place without a polygon is not found" do
    stub_request(:get, "#{NOMINATIM}/lookup").with(query: hash_including(osm_ids: "R1")).to_return(json_response([ row("geojson" => { "type" => "Point", "coordinates" => [ 4.8, 50.3 ] }) ]))
    assert_raises(Providers::CommuneBoundaries::NotFound) { @communes.fetch("R1") }
  end

  test "unavailable when the service is down, or switched off" do
    stub_request(:get, "#{NOMINATIM}/search").with(query: hash_including({})).to_return(status: 503)
    assert_raises(Providers::CommuneBoundaries::Unavailable) { @communes.search("Ciney") }
    off = Providers::CommuneBoundaries.build({ "COMMUNE_BOUNDARIES_PROVIDER" => "none" })
    refute off.available?
    assert_raises(Providers::CommuneBoundaries::Unavailable) { off.search("Ciney") }
  end

  private
    def json_response(body) = { status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" } }
end
