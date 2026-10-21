require "test_helper"

class OfflineSite::TilePlanTest < ActiveSupport::TestCase
  # Ahinvaux: about 640 × 440 m.
  BBOX = [ 4.903, 50.339, 4.912, 50.343 ].freeze

  test "covers the terrain and its margin, from its surroundings down to the finest zoom the budget allows" do
    plan = OfflineSite::TilePlan.new(BBOX)
    assert_equal 12, plan.zooms.first, "a few zooms above the terrain's own view"
    assert_equal (plan.zooms.first..plan.max_zoom).to_a, plan.zooms, "no gap between zooms"
    assert_operator plan.tiles.size, :<=, OfflineSite::TilePlan::MAX_TILES
    assert_equal 19, plan.max_zoom, "a garden reads up close"

    # Every tile of the finest zoom lies over the padded terrain.
    z = plan.max_zoom
    plan.tiles.select { |tz, _, _| tz == z }.each do |_, x, y|
      west = x / 2.0**z * 360 - 180
      assert_operator west, :<, plan.bbox[2]
      assert_operator west + 360 / 2.0**z, :>, plan.bbox[0]
      north = Math.atan(Math.sinh(Math::PI * (1 - 2 * y / 2.0**z))) * 180 / Math::PI
      assert_operator north, :>, plan.bbox[1]
    end
  end

  test "a layer's own zooms bound the plan" do
    plan = OfflineSite::TilePlan.new(BBOX, min_zoom: 15, max_zoom: 16)
    assert_equal [ 15, 16 ], plan.zooms
  end

  test "keeps at least one zoom however small the budget" do
    plan = OfflineSite::TilePlan.new(BBOX, budget: 1)
    assert_equal 1, plan.zooms.size
    assert_operator plan.tiles.size, :>=, 1
  end

  test "a larger terrain stops at a coarser zoom" do
    small = OfflineSite::TilePlan.new(BBOX)
    large = OfflineSite::TilePlan.new([ 4.80, 50.30, 4.95, 50.40 ])
    assert_operator large.max_zoom, :<, small.max_zoom
    assert_operator large.tiles.size, :<=, OfflineSite::TilePlan::MAX_TILES
  end
end
