require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

class AerialViews::XyzCopyTest < ActiveSupport::TestCase
  include DroneTestHelper

  TILE = Vips::Image.black(256, 256).add([ 40, 120, 60 ]).cast(:uchar).pngsave_buffer.freeze
  TILES = %r{\Ahttps://tiles\.example\.org/ahinvaux/\d+/\d+/\d+\.png\z}

  setup do
    @map = maps(:ahinvaux)
    @dir = Dir.mktmpdir
  end

  teardown { FileUtils.remove_entry(@dir) }

  def copy_view(**attributes)
    aerial_view(@map, kind: "xyz", url: XYZ_URL, status: "processing", source_filename: "copie de tiles.example.org", **attributes)
  end

  # The host has tiles up to `max` zoom.
  def stub_tiles(max:)
    stub_request(:get, TILES).to_return do |request|
      z = request.uri.path[%r{/ahinvaux/(\d+)/}, 1].to_i
      z <= max ? { status: 200, body: TILE, headers: { "Content-Type" => "image/png" } } : { status: 404 }
    end
  end

  test "fetches every tile over the map and its margin into an MBTiles file, rows counted from the south" do
    stub_tiles(max: 17)
    path = AerialViews::XyzCopy.new(copy_view(min_zoom: 16, max_zoom: 17), @dir).call
    db = SQLite3::Database.new(path)
    metadata = db.execute("SELECT name, value FROM metadata").to_h
    assert_equal [ "png", "16", "17" ], metadata.values_at("format", "minzoom", "maxzoom")
    west, south, east, north = metadata["bounds"].split(",").map(&:to_f)
    bbox = @map.bbox
    assert west < bbox[0] && south < bbox[1] && east > bbox[2] && north > bbox[3], "the bounds cover the map"
    row = db.get_first_row("SELECT tile_column, tile_row FROM tiles WHERE zoom_level = 17 ORDER BY tile_row DESC LIMIT 1")
    x, y = row[0], 2**17 - 1 - row[1]
    assert_requested :get, "https://tiles.example.org/ahinvaux/17/#{x}/#{y}.png"
    assert_operator db.get_first_value("SELECT count(*) FROM tiles WHERE zoom_level = 16"), :>, 0
  ensure
    db&.close
  end

  test "without a maximum zoom, takes the strongest the host answers at the map's centre" do
    stub_tiles(max: 15)
    path = AerialViews::XyzCopy.new(copy_view, @dir).call
    db = SQLite3::Database.new(path)
    assert_equal [ 7, 15 ], db.get_first_row("SELECT min(zoom_level), max(zoom_level) FROM tiles")
  ensure
    db&.close
  end

  test "an address that sends to a login page stops the copy" do
    stub_request(:get, TILES).to_return(status: 302, headers: { "Location" => "https://tiles.example.org/login" })
    error = assert_raises(AerialViews::Tiler::Failure) { AerialViews::XyzCopy.new(copy_view(max_zoom: 17), @dir).call }
    assert_equal "source_unreachable", error.code
  end

  test "a host with no tile over the map leaves nothing to copy" do
    stub_tiles(max: -1)
    error = assert_raises(AerialViews::Tiler::Failure) { AerialViews::XyzCopy.new(copy_view, @dir).call }
    assert_equal "empty", error.code
  end

  test "a copied view becomes a PMTiles archive kept with the map's files" do
    skip_without_imagery_tools
    stub_tiles(max: 17)
    view = copy_view(min_zoom: 16, max_zoom: 17)
    AerialViews::Import.new(view).call
    assert_equal [ "ready", nil, "pmtiles", 16, 17 ], [ view.reload.status, view.failure, view.kind, view.min_zoom, view.max_zoom ]
    assert_equal "webp", AerialViews::PmtilesHeader.read(ActiveStorage::Blob.service.path_for(view.archive.key)).tile_type
  end
end
