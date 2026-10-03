require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../../support/map_data_test_helper"

class Mcp::RegionIdentifyTest < ActiveSupport::TestCase
  include McpTestHelper
  include MapDataTestHelper

  setup { seed_wallonia_layers }

  test "answers what the region layer says at a point" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_sols.json")
    result = Mcp::RegionIdentify.identify(map: maps(:ahinvaux), layer: wallonia_layer("sols"), lng: 4.9055, lat: 50.3405)
    assert_equal "sols", result[:key]
    assert_equal "ok", result[:status]
    assert result[:entries].any?
  end

  test "an upstream that does not answer is reported as unavailable" do
    stub_request(:get, SPW_REST).to_return(status: 503)
    assert_raises(Mcp::RegionIdentify::Unavailable) do
      Mcp::RegionIdentify.identify(map: maps(:ahinvaux), layer: wallonia_layer("sols"), lng: 4.9055, lat: 50.3405)
    end
  end
end
