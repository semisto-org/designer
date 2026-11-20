require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/sun_test_helper"

class McpSiteDataTest < ActionDispatch::IntegrationTest
  include SunTestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @stranger = personal_token(users(:bob))
  end

  test "get_site_data gives the sun figures without the drawing points" do
    stub_pvgis
    data, error = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[sun] })
    refute error
    assert_equal %w[sun], data.keys
    sun = data["sun"]
    assert sun["available"]
    assert_equal 12, sun["months"].size
    assert sun["months"].first.key?("terrain_hours"), "keys are snake_case for the AI"
    assert_equal 3, sun["paths"].size
    assert sun["paths"].none? { _1.key?("points") }
    assert_equal({ "topics" => 1, "available" => 1 }, AiAction.last.result)
  end

  test "a topic that fails says so without failing the others" do
    stub_pvgis
    original = Canopy::MapReport.instance_method(:as_json)
    Canopy::MapReport.define_method(:as_json) { |*| raise "boom" }
    data, error = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[canopy sun] })
    refute error
    assert_equal({ "available" => false, "reason" => "upstream_error" }, data["canopy"])
    assert data.dig("sun", "available")
  ensure
    Canopy::MapReport.define_method(:as_json, original)
  end

  test "the canopy topic leaves out the grid" do
    original = Canopy::MapReport.instance_method(:as_json)
    Canopy::MapReport.define_method(:as_json) do |*|
      { available: true, grid: { data: "AAAA" }, stats: { maxHeightM: 21 } }
    end
    data, = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[canopy] })
    assert_equal({ "available" => true, "stats" => { "max_height_m" => 21 } }, data["canopy"])
  ensure
    Canopy::MapReport.define_method(:as_json, original)
  end

  test "site rules leave out network easements" do
    received = nil
    original = SiteRules::MapReport.instance_method(:initialize)
    SiteRules::MapReport.define_method(:initialize) do |map, **options|
      received = options
      original.bind_call(self, map, **options)
    end
    data, = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[site_rules] })
    assert_equal({ include_networks: false }, received)
    assert data.key?("site_rules")
  ensure
    SiteRules::MapReport.define_method(:initialize, original)
  end

  test "the buildings around the place, with their heights" do
    stub_request(:get, %r{\Ahttps://overpass-api\.de/api/interpreter}).to_return(status: 200, body: { elements: [] }.to_json)
    data, error = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[buildings] })
    refute error
    assert_equal({ "available" => true, "source" => "openstreetmap", "count" => 0 }, data["buildings"].slice("available", "source", "count"))
  end

  test "only for people with a role on the map" do
    text, error = call_tool(@stranger, "get_site_data", { map_id: @map.id })
    assert error
    assert_match(/introuvable/, text)
  end

  test "the wind topic: the region's roses for drawing stripped, and which trees are sheltered" do
    lat, lng = Providers::Era5Land.cell(50.341, 4.9075)
    sector = { "deg" => 270.0, "pct" => 30.0, "mean_kmh" => 18.0, "classes" => [ 1, 29, 0, 0 ] }
    rose = { "year" => { "prevailing_deg" => 270.0, "sectors" => [ sector ] }, "seasons" => { "spring" => { "prevailing_deg" => 45.0, "sectors" => [ sector ] } },
             "cold_spring" => { "prevailing_deg" => 45.0, "hours_pct" => 5.0 }, "strong" => { "prevailing_deg" => 225.0 } }
    ObservedClimate.create!(cell_lat: lat, cell_lng: lng, first_year: 1995, last_year: 2024, status: "ready", computed_at: Time.current,
                            indicators: { "years" => 30, "months" => [], "wind" => rose })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.905, lat: 50.34), properties: { "species_id" => plant_species(:apple).id })
    previous, ENV["CDS_API_KEY"] = ENV["CDS_API_KEY"], "k"
    data, error = call_tool(@owner, "get_site_data", { map_id: @map.id, topics: %w[wind] })
    refute error
    wind = data["wind"]
    assert_equal "ready", wind["status"]
    assert_equal 31, wind["scale"]["wind_grid_km"]
    assert_equal 45.0, wind["rose"]["cold_spring"]["prevailing_deg"]
    assert_not wind["rose"]["year"]["sectors"].first.key?("classes")
    assert_not wind["rose"]["seasons"]["spring"]["sectors"].first.key?("classes")
    tree = wind["trees"]["trees"].sole
    assert_equal %w[wind cold_wind], tree["exposed"].map { _1["type"] }
  ensure
    ENV["CDS_API_KEY"] = previous
  end
end
