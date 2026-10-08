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

  test "only for people with a role on the map" do
    text, error = call_tool(@stranger, "get_site_data", { map_id: @map.id })
    assert error
    assert_match(/introuvable/, text)
  end
end
