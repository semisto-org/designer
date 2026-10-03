require "test_helper"
require "test_helpers/mcp_test_helper"

class Mcp::RegionIdentifyTest < ActiveSupport::TestCase
  include McpTestHelper

  test "calls the provider whatever the names of its arguments" do
    layer = regions(:wallonia).layers.create!(key: "sols", name: "Sols", url: "https://x.example", identify_url: "https://x.example/identify")
    instance_style = Class.new do
      def self.configured? = true
      def initialize(region) = (@region = region)
      def identify(region_layer, longitude:, latitude:) = { "region" => @region.key, "layer" => region_layer.key, "at" => [ longitude, latitude ] }
    end
    stubbing(Mcp::RegionIdentify, :provider, instance_style) do
      result = Mcp::RegionIdentify.identify(map: maps(:ahinvaux), layer:, lng: 4.9, lat: 50.3)
      assert_equal({ "region" => "wallonia", "layer" => "sols", "at" => [ 4.9, 50.3 ] }, result)
    end
  end

  test "a provider that says it is not configured is unavailable" do
    stubbing(Mcp::RegionIdentify, :provider, Class.new { def self.configured? = false }) do
      refute Mcp::RegionIdentify.available?
    end
  end

  test "a signature it cannot fill is reported as unavailable" do
    layer = regions(:wallonia).layers.create!(key: "sols", name: "Sols", url: "https://x.example", identify_url: "https://x.example/identify")
    odd = Class.new { def self.identify(wkt_point, crs) = nil }
    stubbing(Mcp::RegionIdentify, :provider, odd) do
      assert_raises(Mcp::RegionIdentify::Unavailable) { Mcp::RegionIdentify.identify(map: maps(:ahinvaux), layer:, lng: 4.9, lat: 50.3) }
    end
  end
end
