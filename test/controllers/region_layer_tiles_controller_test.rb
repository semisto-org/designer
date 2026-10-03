require "test_helper"
require_relative "../support/map_data_test_helper"

class RegionLayerTilesControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  Z, X, Y = 15, 16830, 11064

  setup do
    seed_wallonia_layers
    @png = file_fixture("providers/tile.png").binread
  end

  def tile_path(key = "sols", z: Z, x: X, y: Y)
    region_layer_tile_path(regions(:wallonia), key, z, x, y)
  end

  test "relays a tile with long browser caching and an ETag (no sign-in needed)" do
    stub_request(:get, SPW_WMS).to_return(status: 200, body: @png, headers: { "Content-Type" => "image/png" })
    get tile_path
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal @png, response.body.b
    assert_match "public", response.headers["Cache-Control"]
    assert_match "max-age=#{7.days.to_i}", response.headers["Cache-Control"]
    assert response.headers["ETag"].present?

    get tile_path, headers: { "If-None-Match" => response.headers["ETag"] }
    assert_response :not_modified
    assert_requested :get, SPW_WMS, times: 1
  end

  test "server cache hit: the upstream is called once for two browsers" do
    stub = stub_request(:get, SPW_WMS).to_return(status: 200, body: @png, headers: { "Content-Type" => "image/png" })
    with_memory_cache do
      get tile_path
      get tile_path
      assert_response :success
    end
    assert_requested stub, times: 1
  end

  test "upstream errors answer 502, not cached" do
    stub_request(:get, SPW_WMS).to_return(status: 500)
    get tile_path
    assert_response :bad_gateway
    assert_equal "no-store", response.headers["Cache-Control"]
  end

  test "host allow-list: a layer pointing elsewhere is never fetched" do
    wallonia_layer("sols").update!(url: "https://evil.example.org/wms")
    get tile_path
    assert_response :forbidden
    assert_not_requested :get, /evil/
  end

  test "unknown, disabled, direct and out-of-range layers or tiles answer 404" do
    get tile_path("nope")
    assert_response :not_found
    wallonia_layer("pentes").update!(enabled: false)
    get tile_path("pentes")
    assert_response :not_found
    get tile_path("plan")
    assert_response :not_found
    get tile_path(x: 0, y: 0)
    assert_response :not_found
    assert_not_requested :get, SPW_WMS
  end
end
