require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

class AerialViews::TilerTest < ActiveSupport::TestCase
  include DroneTestHelper

  setup { @dir = Dir.mktmpdir("tiler-test") }
  teardown { FileUtils.remove_entry(@dir) }

  def copy(fixture, name = fixture)
    File.join(@dir, name).tap { FileUtils.cp(file_fixture(fixture), _1) }
  end

  def tiler(path) = AerialViews::Tiler.new(path, @dir)

  def failure_of(path)
    assert_raises(AerialViews::Tiler::Failure) { tiler(path).call }.code
  end

  test "recognises the file by its first bytes, whatever its name" do
    assert_equal :geotiff, tiler(copy("drone-ortho.tif", "ortho.bin")).format
    assert_equal :pmtiles, tiler(copy("drone-view.pmtiles", "vue.tif")).format
    assert_nil tiler(copy("terrain.jpg")).format
    assert_equal "unsupported_format", failure_of(copy("terrain.jpg", "terrain.tif"))
  end

  test "a georeferenced orthophoto becomes a PMTiles archive of WebP tiles, in Web Mercator" do
    skip_without_imagery_tools
    archive = tiler(copy("drone-ortho.tif")).call
    header = AerialViews::PmtilesHeader.read(archive)
    assert_equal "webp", header.tile_type
    assert header.addressed_tiles.positive?
    assert_operator header.max_zoom, :>=, 18
    assert_operator header.min_zoom, :<, header.max_zoom, "overviews down from the full resolution"
    # Lambert 72 (186000, 113000) is at Yvoir.
    assert_in_delta 4.874, header.bounds["west"], 0.01
    assert_in_delta 50.327, header.bounds["south"], 0.01
  end

  test "an image without coordinates is refused, with what to do" do
    skip_without_imagery_tools
    assert_equal "not_georeferenced", failure_of(copy("drone-plain.tif"))
  end

  test "an archive of raster tiles is kept as it is; vector tiles are refused" do
    path = copy("drone-view.pmtiles")
    assert_equal path, tiler(path).call
    vector = File.join(@dir, "vector.pmtiles")
    bytes = File.binread(path)
    bytes.setbyte(99, 1)
    File.binwrite(vector, bytes)
    assert_equal "not_raster", failure_of(vector)
  end

  test "an MBTiles of vector tiles is refused" do
    path = File.join(@dir, "vector.mbtiles")
    db = SQLite3::Database.new(path)
    db.execute("CREATE TABLE metadata (name text, value text)")
    db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
    db.execute("INSERT INTO metadata VALUES ('format', 'pbf')")
    db.close
    assert_equal "not_raster", failure_of(path)
  end

  test "a tile keeps its transparency only where the flight ends; an empty one is dropped" do
    tiler = tiler(@dir)
    opaque = Vips::Image.black(256, 256).bandjoin([ 0, 0, 255 ]).cast(:uchar).pngsave_buffer
    edge = Vips::Image.black(256, 256, bands: 3).bandjoin(Vips::Image.black(256, 128).embed(0, 0, 256, 256, extend: :white)).cast(:uchar).pngsave_buffer
    empty = Vips::Image.black(256, 256, bands: 4).cast(:uchar).pngsave_buffer

    opaque_webp = Vips::Image.new_from_buffer(tiler.send(:webp_tile, opaque), "")
    refute opaque_webp.has_alpha?
    assert_equal 3, opaque_webp.bands
    assert Vips::Image.new_from_buffer(tiler.send(:webp_tile, edge), "").has_alpha?
    assert_nil tiler.send(:webp_tile, empty)
  end
end
