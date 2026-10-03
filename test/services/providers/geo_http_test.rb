require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::GeoHttpTest < ActiveSupport::TestCase
  include MapDataTestHelper

  URL = "https://geoservices.wallonie.be/arcgis/rest/services/X/MapServer/identify".freeze

  test "allow-list: https on listed hosts only, extendable by ENV" do
    assert Providers::GeoHttp.allowed?(URL)
    assert_not Providers::GeoHttp.allowed?("http://geoservices.wallonie.be/x")
    assert_not Providers::GeoHttp.allowed?("https://geoservices.wallonie.be.evil.org/x")
    assert_not Providers::GeoHttp.allowed?("not a url")
    ENV["MAP_RELAY_EXTRA_HOSTS"] = "wms.example.lu, tiles.example.fr"
    assert Providers::GeoHttp.allowed?("https://tiles.example.fr/x")
  ensure
    ENV.delete("MAP_RELAY_EXTRA_HOSTS")
  end

  test "circuit breaker: fails fast after repeated failures, then recovers" do
    with_memory_cache do
      stub = stub_request(:get, URL).to_timeout
      Providers::GeoHttp::FAILURES.times do
        assert_raises(Providers::GeoHttp::Unavailable) { Providers::GeoHttp.get(URL) }
      end
      error = assert_raises(Providers::GeoHttp::Unavailable) { Providers::GeoHttp.get(URL) }
      assert_match "circuit open", error.message
      assert_requested stub, times: Providers::GeoHttp::FAILURES

      Rails.cache.clear
      stub_request(:get, URL).to_return(status: 200, body: "{}")
      assert_equal "{}", Providers::GeoHttp.get(URL).body
    end
  end

  test "4xx answers do not trip the breaker" do
    with_memory_cache do
      stub_request(:get, URL).to_return(status: 404)
      (Providers::GeoHttp::FAILURES + 1).times do
        error = assert_raises(Providers::GeoHttp::Unavailable) { Providers::GeoHttp.get(URL) }
        assert_equal "HTTP 404", error.message
      end
    end
  end
end
