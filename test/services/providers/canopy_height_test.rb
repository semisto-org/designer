require "test_helper"
require_relative "../../test_helpers/canopy_test_helper"

class Providers::CanopyHeightTest < ActiveSupport::TestCase
  include CanopyTestHelper

  # Ahinvaux, Yvoir: in file 1202023103.
  LNG = 4.9075
  LAT = 50.341

  setup do
    @gx, @gy = global_pixel(LNG, LAT)
    @fx, @fy = @gx / PX, @gy / PX
    @quadkey = Providers::CanopyHeight.quadkey(@fx, @fy)
    @tx, @ty = (@gx % PX) / 512, (@gy % PX) / 512
    @provider = Providers::CanopyHeight.new(BASE)
    stub_request(:get, "#{BASE}/metadata/#{@quadkey}.geojson")
      .to_return(status: 200, body: file_fixture("canopy/metadata_1202023103.geojson").read)
  end

  def serve(tiles)
    stub_ranged("#{BASE}/chm/#{@quadkey}.tif", canopy_tiff(@fx, @fy, tiles))
  end

  # A bbox around the pixel (col, row) of the file, w × h pixels.
  def bbox_around(col, row, w, h)
    gx, gy = @fx * PX + col, @fy * PX + row
    west, north = Relief::Mercator.inverse(gx * RES - HALF + RES / 2, HALF - gy * RES - RES / 2)
    east, south = Relief::Mercator.inverse((gx + w - 1) * RES - HALF + RES / 2, HALF - (gy + h - 1) * RES - RES / 2)
    { west:, south:, east:, north: }
  end

  test "the quadkey of the Yvoir file" do
    assert_equal "1202023103", @quadkey
    assert_equal "120202310", Providers::CanopyHeight.quadkey(@fx / 2, @fy / 2, 9)
  end

  test "reads the pixels of one internal tile, with the dates of the imagery" do
    serve([ @tx, @ty ] => 17)
    window = @provider.window(**bbox_around(@tx * 512 + 100, @ty * 512 + 100, 200, 150))

    assert_equal [ 200, 150, 1 ], [ window.width, window.height, window.step ]
    assert_equal [ 17 ], window.heights.bytes.uniq
    assert window.covered
    assert_equal [ "2018-09-27", "2018-09-27" ], window.dates
    assert_in_delta 200 * RES, window.mercator[2] - window.mercator[0], 1e-6
    assert_requested :get, "#{BASE}/chm/#{@quadkey}.tif", times: 2 # header, one tile
  end

  test "places each tile's pixels where they belong, and merges contiguous tiles into one request" do
    pattern = (0...512).map { |row| (0...512).map { |col| col == 511 && row == 0 ? 99 : 5 } }.flatten.pack("C*")
    serve([ @tx, @ty ] => pattern, [ @tx + 1, @ty ] => 30)
    window = @provider.window(**bbox_around(@tx * 512 + 500, @ty * 512, 20, 4))

    rows = window.heights.bytes.each_slice(window.width).to_a
    assert_equal [ 5 ] * 11 + [ 99 ] + [ 30 ] * 8, rows[0]
    assert_equal [ 5 ] * 12 + [ 30 ] * 8, rows[1]
    assert_requested :get, "#{BASE}/chm/#{@quadkey}.tif", times: 2
  end

  test "a missing tile or file reads as bare ground" do
    serve({})
    window = @provider.window(**bbox_around(@tx * 512, @ty * 512, 10, 10))
    assert_equal [ 0 ], window.heights.bytes.uniq
    assert window.covered

    stub_request(:get, "#{BASE}/chm/#{@quadkey}.tif").to_return(status: 404)
    window = Providers::CanopyHeight.new(BASE).window(**bbox_around(@tx * 512, @ty * 512, 10, 10))
    assert_not window.covered
  end

  test "large extents are averaged into at most 512 cells a side, keeping the maxima" do
    pattern = (0...512).map { |row| (0...512).map { |col| row.even? && col.even? ? 40 : 0 } }.flatten.pack("C*")
    serve([ @tx, @ty ] => pattern, [ @tx + 1, @ty ] => pattern)
    window = @provider.window(**bbox_around(@tx * 512, @ty * 512, 1000, 100))

    assert_equal 2, window.step
    assert_equal [ 500, 50 ], [ window.width, window.height ]
    assert_equal [ 10 ], window.heights.bytes.uniq
    assert_equal [ 40 ], window.maxima.bytes.uniq
  end

  test "refuses a landscape" do
    assert_raises(Providers::CanopyHeight::TooLarge) do
      @provider.window(west: 4.85, south: 50.3, east: 4.95, north: 50.36)
    end
  end

  test "a file on another grid is refused rather than misread" do
    bytes = canopy_tiff(@fx + 1, @fy, {})
    stub_ranged("#{BASE}/chm/#{@quadkey}.tif", bytes)
    error = assert_raises(Providers::CanopyHeight::Unavailable) { @provider.window(**bbox_around(10, 10, 5, 5)) }
    assert_match "unexpected grid", error.message
  end

  test "upstream errors are Unavailable; missing dates are not an error" do
    stub_request(:get, "#{BASE}/metadata/#{@quadkey}.geojson").to_return(status: 404)
    serve([ @tx, @ty ] => 8)
    assert_nil @provider.window(**bbox_around(@tx * 512, @ty * 512, 5, 5)).dates

    stub_request(:get, "#{BASE}/chm/#{@quadkey}.tif").to_return(status: 500)
    assert_raises(Providers::CanopyHeight::Unavailable) { Providers::CanopyHeight.new(BASE).window(**bbox_around(10, 10, 5, 5)) }
    stub_request(:get, "#{BASE}/chm/#{@quadkey}.tif").to_timeout
    assert_raises(Providers::CanopyHeight::Unavailable) { Providers::CanopyHeight.new(BASE).window(**bbox_around(10, 10, 5, 5)) }
  end

  test "configured by ENV" do
    assert Providers::CanopyHeight.build({}).available?
    assert_not Providers::CanopyHeight.build("CANOPY_HEIGHT_PROVIDER" => "none").available?
    assert_raises(Providers::CanopyHeight::Unavailable) do
      Providers::CanopyHeight.build("CANOPY_HEIGHT_PROVIDER" => "none").window(west: 0, south: 0, east: 0, north: 0)
    end
    custom = Providers::CanopyHeight.build("CANOPY_HEIGHT_URL" => "https://mirror.example.org/chm/")
    assert_equal "https://mirror.example.org/chm/chm/1.tif", custom.file_url("1")
    assert_match "dinov3_global_chm_v2_ml3/chm/1202023103.tif", Providers::CanopyHeight.build({}).file_url("1202023103")
  end
end
