require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::TileRelayTest < ActiveSupport::TestCase
  include MapDataTestHelper

  # Tile z15 over Yvoir (inside Wallonia).
  Z, X, Y = 15, 16830, 11064

  setup do
    seed_wallonia_layers
    @layer = wallonia_layer("sols")
    @png = file_fixture("providers/tile.png").binread
  end

  test "builds a WMS 1.3.0 GetMap in EPSG:3857 with 512 px tiles" do
    stub = stub_request(:get, SPW_WMS).with(query: hash_including(
      "SERVICE" => "WMS", "VERSION" => "1.3.0", "REQUEST" => "GetMap", "LAYERS" => "1,2",
      "CRS" => "EPSG:3857", "WIDTH" => "512", "HEIGHT" => "512", "FORMAT" => "image/png", "TRANSPARENT" => "TRUE"
    )).to_return(status: 200, body: @png, headers: { "Content-Type" => "image/png" })

    tile = Providers::TileRelay.new(@layer).fetch(Z, X, Y)
    assert_equal "image/png", tile.content_type
    assert_equal @png, tile.body
    assert_requested stub
    bbox = Providers::TileMath.bbox_3857(Z, X, Y)
    assert_requested(:get, SPW_WMS) { |req| req.uri.query_values["BBOX"] == bbox.join(",") }
  end

  test "photos ask for JPEG without transparency" do
    stub_request(:get, SPW_WMS).with(query: hash_including("FORMAT" => "image/jpeg", "TRANSPARENT" => "FALSE"))
      .to_return(status: 200, body: "jpeg", headers: { "Content-Type" => "image/jpeg" })
    assert_equal "image/jpeg", Providers::TileRelay.new(wallonia_layer("ortho_2026")).fetch(Z, X, Y).content_type
  end

  test "caches tiles: a second fetch does not call the upstream" do
    stub = stub_request(:get, SPW_WMS).to_return(status: 200, body: @png, headers: { "Content-Type" => "image/png" })
    with_memory_cache do
      2.times { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
    end
    assert_requested stub, times: 1
  end

  test "an XML service exception is an upstream error, never cached" do
    stub = stub_request(:get, SPW_WMS).to_return(status: 200, body: provider_fixture("wms_exception.xml"), headers: { "Content-Type" => "text/xml" })
    with_memory_cache do
      2.times do
        assert_raises(Providers::GeoHttp::Unavailable) { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
      end
    end
    assert_requested stub, times: 2
  end

  test "timeouts and server errors raise Unavailable" do
    stub_request(:get, SPW_WMS).to_timeout
    assert_raises(Providers::GeoHttp::Unavailable) { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
    stub_request(:get, SPW_WMS).to_return(status: 503)
    assert_raises(Providers::GeoHttp::Unavailable) { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
  end

  test "refuses tiles outside the region, above max zoom or below min zoom" do
    relay = Providers::TileRelay.new(@layer)
    assert_raises(Providers::TileRelay::OutOfRange) { relay.fetch(15, 0, 0) }
    assert_raises(Providers::TileRelay::OutOfRange) { relay.fetch(16, X * 2, Y * 2) } # sols caps at 15
    assert_raises(Providers::TileRelay::OutOfRange) { Providers::TileRelay.new(wallonia_layer("cadastre")).fetch(10, 526, 345) }
    assert_raises(Providers::TileRelay::OutOfRange) { relay.fetch(3, 99, 0) }
    assert_not_requested :get, SPW_WMS
  end

  test "never fetches a host outside the allow-list" do
    @layer.update!(url: "https://evil.example.org/wms")
    assert_raises(Providers::GeoHttp::Forbidden) { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
    @layer.update!(url: "http://geoservices.wallonie.be/arcgis/services/X/MapServer/WMSServer")
    assert_raises(Providers::GeoHttp::Forbidden) { Providers::TileRelay.new(@layer).fetch(Z, X, Y) }
    assert_not_requested :get, /evil|http:/
  end
end
