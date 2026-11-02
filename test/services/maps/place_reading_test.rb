require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class Maps::PlaceReadingTest < ActiveSupport::TestCase
  include ReliefTestHelper

  setup do
    @region = configure_relief_region
    @map = Map.create!(name: "Pente", owner: users(:bob), region: @region,
      boundary: { "type" => "Polygon", "coordinates" => [ [ [ 4.905, 50.34 ], [ 4.906, 50.34 ], [ 4.906, 50.341 ], [ 4.905, 50.341 ], [ 4.905, 50.34 ] ] ] })
  end

  test "reads a map's place like a tried one: slope, which way, where water gathers" do
    x0, y0 = Relief::Mercator.forward(4.9055, 50.3405)
    scale = Math.cos(50.3405 * Math::PI / 180)
    stub_identify(MNT, ->(x, y) { (200 + (y - y0) * scale * 0.1 + (x - x0) * 0).round(3) })
    reading = Maps::PlaceReading.new(@map, provider: instant_provider(@region)).call
    assert_in_delta 10, reading["slope_pct"], 0.5
    assert_equal "s", reading["downhill"]
    assert reading["low_point"]
  end

  test "nothing to read without an outline, and only the size when the relief is down" do
    assert_equal({}, Maps::PlaceReading.new(Map.create!(name: "Vide", owner: users(:bob), region: @region)).call)
    stub_request(:post, "#{MNT}/identify").to_return(status: 503)
    reading = Maps::PlaceReading.new(@map, provider: instant_provider(@region)).call
    assert_nil reading["slope_pct"]
    assert reading["area_m2"].positive?
  end
end
