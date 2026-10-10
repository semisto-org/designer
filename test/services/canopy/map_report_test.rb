require "test_helper"
require_relative "../../test_helpers/canopy_test_helper"

class Canopy::MapReportTest < ActiveSupport::TestCase
  include CanopyTestHelper

  # A provider answering a window exactly over the asked bounds, at 1 px per
  # cell, with heights from a block (col, row, width) => metres.
  class FakeProvider
    attr_reader :asked

    def initialize(available: true, dates: [ "2018-09-27", "2019-05-14" ], covered: true, error: nil, &heights)
      @available, @dates, @covered, @error, @heights = available, dates, covered, error, heights
    end

    def available? = @available
    def attribution = "Meta and WRI"

    def window(west:, south:, east:, north:)
      raise @error if @error

      @asked = { west:, south:, east:, north: }
      min_x, min_y = Relief::Mercator.forward(west, south)
      max_x, max_y = Relief::Mercator.forward(east, north)
      res = Providers::CanopyHeight::RESOLUTION
      width, height = ((max_x - min_x) / res).ceil, ((max_y - min_y) / res).ceil
      bytes = (0...height).flat_map { |row| (0...width).map { |col| @heights.call(col, row, width) } }.pack("C*")
      Providers::CanopyHeight::Window.new(
        width:, height:, step: 1, heights: bytes, maxima: bytes,
        mercator: [ min_x, max_y - height * res, min_x + width * res, max_y ],
        bounds: [ west, south, east, north ], dates: @dates, covered: @covered
      )
    end
  end

  setup do
    @map = maps(:ahinvaux) # 4.903–4.912 × 50.339–50.343, about 640 × 445 m
  end

  test "measures inside the outline, with a 30 m margin around for the grid" do
    provider = FakeProvider.new { |col, _row, width| col < width / 2 ? 24 : 0 }
    json = Canopy::MapReport.new(@map, provider:).as_json

    assert json[:available]
    assert_in_delta 4.903 - 30 / (111_320 * Math.cos(50.341 * Math::PI / 180)), provider.asked[:west], 1e-9
    assert_in_delta 50.343 + 30 / 111_320.0, provider.asked[:north], 1e-9

    stats = json[:stats]
    assert_in_delta 284_800, stats[:terrainAreaM2], 284_800 * 0.01
    assert_equal 24, stats[:maxHeightM]
    # The west half of the window holds the trees; the margin shifts the
    # split a little east of the outline's middle.
    assert_in_delta 0.5, stats[:canopyShare], 0.06
    assert_equal stats[:canopyAreaM2], stats[:tallAreaM2]
    assert_equal 24.0, stats[:meanCanopyHeightM]
    assert_equal({ from: "2018-09-27", to: "2019-05-14" }, json[:imagery])
    assert_equal "CC BY 4.0", json[:source][:licence]

    grid = json[:grid]
    assert_equal grid[:width] * grid[:height], Base64.strict_decode64(grid[:data]).bytesize
    assert_in_delta 0.76, grid[:cellM], 0.01
    assert_equal %i[west south east north], grid[:bounds].keys
  end

  test "holes in the outline are left out" do
    @map.boundary = { "type" => "Polygon", "coordinates" => [
      [ [ 4.903, 50.339 ], [ 4.912, 50.339 ], [ 4.912, 50.343 ], [ 4.903, 50.343 ], [ 4.903, 50.339 ] ],
      [ [ 4.905, 50.340 ], [ 4.910, 50.340 ], [ 4.910, 50.342 ], [ 4.905, 50.342 ], [ 4.905, 50.340 ] ]
    ] }
    stats = Canopy::MapReport.new(@map, provider: FakeProvider.new { 8 }).as_json[:stats]
    full = 284_800
    hole = 5 / 9.0 * 2 / 4.0 * full
    assert_in_delta full - hole, stats[:terrainAreaM2], full * 0.01
    assert_equal 1.0, stats[:canopyShare]
    assert_equal 0, stats[:tallAreaM2]
  end

  test "open ground: no canopy, no mean height" do
    stats = Canopy::MapReport.new(@map, provider: FakeProvider.new(dates: nil) { 1 }).as_json
    assert_equal 0, stats[:stats][:canopyShare]
    assert_nil stats[:stats][:meanCanopyHeightM]
    assert_nil stats[:imagery]
  end

  test "says why when it cannot measure" do
    assert_equal({ available: false, reason: "not_configured" }, Canopy::MapReport.new(@map, provider: FakeProvider.new(available: false) { 0 }).as_json)
    assert_equal "no_coverage", Canopy::MapReport.new(@map, provider: FakeProvider.new(covered: false) { 0 }).as_json[:reason]
    assert_equal "too_large", Canopy::MapReport.new(@map, provider: FakeProvider.new(error: Providers::CanopyHeight::TooLarge) { 0 }).as_json[:reason]
    assert_equal "upstream_error", Canopy::MapReport.new(@map, provider: FakeProvider.new(error: Providers::CanopyHeight::Unavailable) { 0 }).as_json[:reason]

    @map.boundary = nil
    assert_equal "no_outline", Canopy::MapReport.new(@map, provider: FakeProvider.new { 0 }).as_json[:reason]
  end

  test "end to end on the CHMv2 layout" do
    west, north = global_pixel(4.9025, 50.3433)
    east, south = global_pixel(4.9125, 50.3387)
    fx, fy = west / PX, north / PX
    tiles = ((north % PX) / 512..(south % PX) / 512).flat_map { |ty| ((west % PX) / 512..(east % PX) / 512).map { |tx| [ [ tx, ty ], 22 ] } }.to_h
    quadkey = Providers::CanopyHeight.quadkey(fx, fy)
    stub_ranged("#{BASE}/chm/#{quadkey}.tif", canopy_tiff(fx, fy, tiles))
    stub_request(:get, "#{BASE}/metadata/#{quadkey}.geojson").to_return(status: 200, body: file_fixture("canopy/metadata_1202023103.geojson").read)

    json = Canopy::MapReport.new(@map, provider: Providers::CanopyHeight.new(BASE)).as_json
    assert json[:available], json.inspect
    assert_equal 2, json[:grid][:cellM].round
    assert_equal 22, json[:stats][:maxHeightM]
    assert_equal 1.0, json[:stats][:canopyShare]
    assert_equal({ from: "2018-09-27", to: "2018-09-27" }, json[:imagery])
  end
end
