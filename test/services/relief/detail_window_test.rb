require "test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/territories_test_helper"
require "test_helpers/teams_test_helper"

class Relief::DetailWindowTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  test "neighbouring points share one window of about 2.5 km at 5 m, under the flow budget" do
    window = Relief::DetailWindow.for_point(4.77, 50.78)
    assert_equal window.key, Relief::DetailWindow.for_point(4.7701, 50.7801).key
    assert_equal window.key, Relief::DetailWindow.from_key(window.key).key
    extent = window.extent
    assert_equal 5.0, extent.cell_size_m
    assert_in_delta 2_550, extent.width_m, 100
    assert_operator extent.cells, :<=, Relief::FlowGrid::MAX_CELLS
    min_lng, min_lat, max_lng, max_lat = window.bbox
    assert (min_lng..max_lng).cover?(4.77) && (min_lat..max_lat).cover?(50.78)
  end

  test "the flow axes of a valley: one main line down its floor, with the ground it drains" do
    territory = make_territory(make_team("Semisto", admin: users(:michael)))
    window = Relief::DetailWindow.for_point(4.92, 50.34)
    # A valley running south, its floor on x = 0.
    terrain = synthetic_terrain(territory, window:) { |dx, dy| 200 + dy * 0.02 + dx.abs * 0.05 }
    grid = Relief::FlowGrid.new(terrain)
    axes = Relief::FlowAxes.new(grid, min_drained_m2: 50_000)
    found = axes.call
    main = found.max_by(&:drained_m2)
    assert_operator main.length_m, :>, 1_000
    lngs = main.coordinates.map(&:first)
    assert_operator lngs.max - lngs.min, :<, 0.001, "the main axis follows the valley floor"
    assert_operator main.coordinates.first.last, :>, main.coordinates.last.last, "it runs downhill, to the south"
    assert_equal "LineString", axes.as_geojson(found)[:features].first.dig(:geometry, :type)
  end
end
