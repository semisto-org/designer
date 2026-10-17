require "test_helper"

class AerialViews::PmtilesHeaderTest < ActiveSupport::TestCase
  test "reads the tile type, zooms and bounds of an archive" do
    header = AerialViews::PmtilesHeader.read(file_fixture("drone-view.pmtiles"))
    assert_equal [ "webp", 17, 18 ], [ header.tile_type, header.min_zoom, header.max_zoom ]
    assert header.raster?
    assert_in_delta 4.8743, header.bounds["west"], 0.001
    assert_in_delta 50.3282, header.bounds["north"], 0.001
    assert header.addressed_tiles.positive?
  end

  test "anything else is not an archive" do
    assert_nil AerialViews::PmtilesHeader.read(file_fixture("terrain.jpg"))
  end
end
