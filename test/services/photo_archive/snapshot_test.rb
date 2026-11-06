require "test_helper"
require "test_helpers/photo_archive_test_helper"

class PhotoArchive::SnapshotTest < ActiveSupport::TestCase
  include PhotoArchiveTestHelper

  test "one GetMap of a WMS photo over the box" do
    layer = seed_wallonia_photos.first
    stub_photo("ORTHO_1971", jpeg(size: 64))
    bytes = PhotoArchive::Snapshot.call(layer, [ 543_000, 6_510_000, 543_500, 6_510_500 ], width: 64, height: 64)
    assert bytes.start_with?("\xFF\xD8".b)
    assert_requested :get, /BBOX=543000,6510000,543500,6510500/
  end

  test "tiles stitched and cropped for a tiled photo, missing tiles left white" do
    layer = regions(:wallonia).layers.create!(key: "ortho_1950", name: "Photo 1950-1965", group_name: "photos", category: "base",
                                            kind: "xyz", proxied: true, url: "https://data.geopf.fr/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
                                            options: { "tile_size" => 256, "year" => 1950 })
    tile = Vips::Image.black(256, 256).add([ 10, 200, 10 ]).cast(:uchar).pngsave_buffer
    stub_request(:get, /data\.geopf\.fr/).to_return(status: 200, body: tile, headers: { "Content-Type" => "image/png" })
    stub_request(:get, /TILECOL=33201/).to_return(status: 404)
    image = Vips::Image.new_from_buffer(PhotoArchive::Snapshot.call(layer, [ 261_000, 6_249_000, 262_000, 6_250_000 ], width: 100, height: 100), "")
    assert_equal [ 100, 100 ], [ image.width, image.height ]
    assert_operator image.extract_band(1).max, :>, 150
  end

  test "a host off the relay list is never fetched" do
    layer = regions(:wallonia).layers.create!(key: "x", name: "X", category: "base", group_name: "photos", kind: "wms",
                                              url: "https://evil.example/wms", layers: "0")
    assert_raises(Providers::GeoHttp::Forbidden) { PhotoArchive::Snapshot.call(layer, [ 0, 0, 1, 1 ], width: 8, height: 8) }
  end
end
