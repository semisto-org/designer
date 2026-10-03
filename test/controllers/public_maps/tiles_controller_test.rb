require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class PublicMaps::TilesControllerTest < ActionDispatch::IntegrationTest
  PNG = "\x89PNG\r\n\x1a\n".b + ("0" * 40).b

  setup do
    @map = maps(:ahinvaux)
    region = @map.region
    @ortho = region.layers.create!(key: "ortho", name: "Orthophoto", url: "https://geo.example.org/wms", kind: "wms",
                                   category: "base", layers: "ORTHO", options: { "format" => "image/jpeg" })
    @osm = region.layers.create!(key: "osm", name: "OSM", url: "https://tiles.example.org/{z}/{x}/{y}.png", kind: "xyz", category: "base")
    @arc = region.layers.create!(key: "arc", name: "Arc", url: "https://arc.example.org/rest/MapServer", kind: "arcgis_rest", layers: "0,1")
    @gas = region.layers.create!(key: "gaz", name: "Gaz", url: "https://geo.example.org/gaz", kind: "wms", group_name: "Réseaux")
    @private = region.layers.create!(key: "prive", name: "Non publiée", url: "https://geo.example.org/prive", kind: "wms")
    @publication = MapPublication.publish!(@map, by: users(:michael), options: { "region_layers" => %w[ortho osm arc gaz] })
  end

  def tile_path(key, z: 12, x: 2100, y: 1380) = public_map_tile_path(@publication.token, key, z, x, y)

  test "xyz layer: substitutes z/x/y and relays the image" do
    stub = stub_request(:get, "https://tiles.example.org/12/2100/1380.png").to_return(body: PNG, headers: { "Content-Type" => "image/png" })
    get tile_path("osm")
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal PNG, response.body.b
    assert_match(/max-age=/, response.headers["Cache-Control"])
    assert_requested stub
  end

  test "WMS layer: GetMap in EPSG:3857 with the tile's bounding box and the layer's format" do
    stub = stub_request(:get, %r{\Ahttps://geo\.example\.org/wms\?}).with { |req|
      q = Rack::Utils.parse_query(req.uri.query)
      q["SERVICE"] == "WMS" && q["REQUEST"] == "GetMap" && q["LAYERS"] == "ORTHO" && q["CRS"] == "EPSG:3857" &&
        q["FORMAT"] == "image/jpeg" && q["WIDTH"] == "256" && q["BBOX"].split(",").size == 4
    }.to_return(body: PNG, headers: { "Content-Type" => "image/jpeg" })
    get tile_path("ortho")
    assert_response :success
    assert_equal "image/jpeg", response.media_type
    assert_requested stub
  end

  test "bounding box of the world tile is the full Web Mercator square" do
    proxy = Collab::TileProxy.new(@ortho)
    q = Rack::Utils.parse_query(URI.parse(proxy.upstream_url(0, 0, 0)).query)
    assert_equal "-20037508.342789,-20037508.342789,20037508.342789,20037508.342789", q["BBOX"]
    q = Rack::Utils.parse_query(URI.parse(proxy.upstream_url(1, 1, 0)).query)
    assert_equal "0.0,0.0,20037508.342789,20037508.342789", q["BBOX"]
  end

  test "ArcGIS REST layer: export call" do
    stub = stub_request(:get, %r{\Ahttps://arc\.example\.org/rest/MapServer/export\?}).with { |req|
      q = Rack::Utils.parse_query(req.uri.query)
      q["f"] == "image" && q["layers"] == "show:0,1" && q["bboxSR"] == "3857" && q["size"] == "256,256"
    }.to_return(body: PNG, headers: { "Content-Type" => "image/png" })
    get tile_path("arc")
    assert_response :success
    assert_requested stub
  end

  test "only layers the owner published, and never a network layer" do
    get tile_path("prive")
    assert_response :not_found
    get tile_path("gaz")
    assert_response :not_found
    get tile_path("inconnue")
    assert_response :not_found
    assert_not_requested :get, /geo\.example\.org\/(prive|gaz)/
  end

  test "unpublished views serve no tiles" do
    @publication.unpublish!
    get tile_path("osm")
    assert_response :gone
  end

  test "bad coordinates are refused before any upstream call" do
    get tile_path("osm", z: 30)
    assert_response :bad_request
    get tile_path("osm", z: 3, x: 9, y: 0)
    assert_response :bad_request
    assert_not_requested :get, /tiles\.example\.org/
  end

  test "an unreachable or misbehaving provider gives a 502, never a crash" do
    stub_request(:get, "https://tiles.example.org/12/2100/1380.png").to_timeout
    get tile_path("osm")
    assert_response :bad_gateway

    stub_request(:get, "https://tiles.example.org/12/2101/1380.png").to_return(body: "<html>erreur</html>", headers: { "Content-Type" => "text/html" })
    get tile_path("osm", x: 2101)
    assert_response :bad_gateway

    stub_request(:get, "https://tiles.example.org/12/2102/1380.png").to_return(status: 500)
    get tile_path("osm", x: 2102)
    assert_response :bad_gateway
  end

  test "no account needed" do
    stub_request(:get, "https://tiles.example.org/12/2100/1380.png").to_return(body: PNG, headers: { "Content-Type" => "image/png" })
    get tile_path("osm")
    assert_response :success
  end
end
