require "test_helper"
require_relative "../../support/regions_test_helper"

# The tile templates of the new catalogues, as the relay fetches them.
class Providers::RegionalTilesTest < ActiveSupport::TestCase
  include RegionsTestHelper

  setup { seed_regions }

  test "France: WMTS KVP in the PM tile matrix set, row and column from z/x/y" do
    layer = region("france").layers.find_by!(key: "ortho")
    url = layer.upstream_tile_url(17, 66440, 45079)
    assert_match "LAYER=ORTHOIMAGERY.ORTHOPHOTOS", url
    assert_match "TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX=17&TILEROW=45079&TILECOL=66440", url
    assert_match "STYLE=CARTE%20DES%20SOLS", region("france").layers.find_by!(key: "sols").url
  end

  test "Luxembourg: REST WMTS in each layer's own tile matrix set" do
    catalogue = region("luxembourg").layers
    assert_equal "https://wmts1.geoportail.lu/opendata/wmts/ortho_latest/GLOBAL_WEBMERCATOR_4_V3/17/67767/44672.jpeg",
                 catalogue.find_by!(key: "ortho").upstream_tile_url(17, 67767, 44672)
    assert_match "/topomap/GLOBAL_WEBMERCATOR/", catalogue.find_by!(key: "topo").url
  end

  test "SoilGrids: a base URL that already carries a parameter" do
    layer = Region.europe.layers.find_by!(key: "sol_ph")
    url = layer.upstream_tile_url(12, 2120, 1400)
    assert url.start_with?("https://maps.isric.org/mapserv?map=/map/phh2o.map&")
    assert_equal 1, url.count("?")
    assert_match "LAYERS=phh2o_0-5cm_mean", url
  end

  test "the relay serves a French tile" do
    stub_request(:get, %r{\Ahttps://data\.geopf\.fr/wmts}).to_return(status: 200, body: "png", headers: { "Content-Type" => "image/png" })
    layer = region("france").layers.find_by!(key: "cadastre")
    tile = Providers::TileRelay.new(layer).fetch(17, 66440, 45079)
    assert_equal "image/png", tile.content_type
  end

  test "the relay refuses a French tile outside France" do
    layer = region("france").layers.find_by!(key: "cadastre")
    assert_raises(Providers::TileRelay::OutOfRange) { layer.then { Providers::TileRelay.new(_1).fetch(17, 80000, 40000) } }
  end
end
