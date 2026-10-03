require "test_helper"

class Relief::GridTest < ActiveSupport::TestCase
  test "mercator round trip" do
    x, y = Relief::Mercator.forward(4.9078, 50.3414)
    lng, lat = Relief::Mercator.inverse(x, y)
    assert_in_delta 4.9078, lng, 1e-9
    assert_in_delta 50.3414, lat, 1e-9
    assert_in_delta 546_333.8, x, 0.1
  end

  test "extent has metre cells scaled by the Mercator factor and a margin" do
    extent = Relief::Extent.around([ 4.9, 50.34, 4.901, 50.341 ], cell_size_m: 1, margin_m: 10)
    assert_in_delta 1 / Math.cos(50.3405 * Math::PI / 180), extent.step, 1e-6
    # ~71 m wide (0.001° of longitude at 50.34°) plus 2 × 10 m of margin.
    assert_in_delta 91, extent.cols, 2
    assert_in_delta 131, extent.rows, 2
    col, row = extent.to_grid(4.9, 50.341)
    assert_in_delta 10, col, 0.6
    assert_in_delta 10, row, 0.6
    assert_equal extent.cols * extent.rows, extent.cells
    min_lng, min_lat, max_lng, max_lat = extent.bbox_wgs84
    assert min_lng < 4.9 && max_lng > 4.901 && min_lat < 50.34 && max_lat > 50.341
  end

  test "grid policy keeps 1 m cells around a square kilometre" do
    extent = Relief::GridPolicy.extent_for([ 4.9, 50.34, 4.914, 50.349 ])
    assert_equal 1.0, extent.cell_size_m
  end

  test "grid policy coarsens larger terrains" do
    extent = Relief::GridPolicy.extent_for([ 4.9, 50.34, 4.93, 50.36 ])
    assert_equal 2.0, extent.cell_size_m
    extent = Relief::GridPolicy.extent_for([ 4.9, 50.34, 4.96, 50.38 ])
    assert_equal 5.0, extent.cell_size_m
  end

  test "grid policy refuses huge terrains with a French message" do
    error = assert_raises(Relief::GridPolicy::TooLarge) { Relief::GridPolicy.extent_for([ 4.8, 50.2, 5.2, 50.5 ]) }
    assert_match(/trop étendu/, error.message)
    assert_match(/km²/, error.message)
  end

  test "raster packs heights in centimetres above the minimum" do
    packed = Relief::Raster.pack_heights([ 100.123, nil, 101.5, 99.995 ])
    assert_equal 99.99, packed.z_min
    assert_equal 101.5, packed.z_max
    assert_equal 1, packed.nodata_count
    assert_equal 8, packed.bytes.bytesize
    raw = packed.bytes.unpack("v*")
    assert_equal [ 13, 65_535, 151, 1 ], raw
    heights = Relief::Raster.unpack_heights(packed.bytes, z_min: packed.z_min)
    assert_in_delta 100.12, heights[0], 0.005
    assert_nil heights[1]
  end

  test "raster packs land cover classes, unknown as 255" do
    assert_equal [ 7, 255, 90, 255 ], Relief::Raster.pack_classes([ 7, nil, 90, 400 ]).bytes
  end

  test "mask fills the cells whose centre is inside the polygon, holes excluded" do
    extent = Relief::Extent.around([ 4.9, 50.34, 4.9005, 50.3405 ], cell_size_m: 1, margin_m: 5)
    outer = square(lng: 4.9, lat: 50.34, size: 0.0005)
    mask = Relief::Mask.for_geometry(Map.parse_geojson(outer), extent)
    inside = mask.count("\x01")
    # ~35.6 m × 55.6 m
    assert_in_delta 35.6 * 55.6, inside, 120
    assert_equal 1, mask.getbyte(extent.cols * (extent.rows / 2) + extent.cols / 2)
    assert_equal 0, mask.getbyte(0)

    hole = { "type" => "Polygon", "coordinates" => [ outer["coordinates"].first,
      [ [ 4.9001, 50.3401 ], [ 4.9001, 50.3404 ], [ 4.9004, 50.3404 ], [ 4.9004, 50.3401 ], [ 4.9001, 50.3401 ] ] ] }
    holed = Relief::Mask.for_geometry(Map.parse_geojson(hole), extent).count("\x01")
    assert holed < inside - 500
  end

  test "stats give the drop and slope inside the mask" do
    extent = Relief::Extent.around([ 4.9, 50.34, 4.9003, 50.3003 + 0.04 ], cell_size_m: 1, margin_m: 2)
    # A plane rising 10 % towards the north (rows go south).
    heights = Array.new(extent.cells) { |i| 100 + (extent.rows - i / extent.cols) * 0.1 }
    # Inside: every cell but the outer ring (edges clamp their neighbours).
    mask = Array.new(extent.cells) do |i|
      c = i % extent.cols
      r = i / extent.cols
      c.between?(1, extent.cols - 2) && r.between?(1, extent.rows - 2) ? 1 : 0
    end.pack("C*")
    stats = Relief::Stats.new(heights, extent, mask).call
    assert_in_delta 10.0, stats["slope_mean_pct"], 0.01
    assert_in_delta 10.0, stats["slope_p90_pct"], 0.01
    assert_in_delta (extent.rows - 3) * 0.1, stats["drop"], 0.01
    assert_equal (extent.cols - 2) * (extent.rows - 2), stats["cells"]
  end

  test "stats are empty outside any boundary" do
    extent = Relief::Extent.around([ 4.9, 50.34, 4.9001, 50.3401 ], cell_size_m: 1, margin_m: 1)
    assert_equal({}, Relief::Stats.new(Array.new(extent.cells, 1.0), extent, ("\x00" * extent.cells).b).call)
  end
end
