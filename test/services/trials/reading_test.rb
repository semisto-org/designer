require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class Trials::ReadingTest < ActiveSupport::TestCase
  include ReliefTestHelper

  setup do
    @region = configure_relief_region
    @trial = MapTrial.create!(center: GeoJsonGeometry::FACTORY.point(4.9055, 50.3405), region: @region,
      boundary: { "type" => "Polygon", "coordinates" => [ [ [ 4.905, 50.34 ], [ 4.906, 50.34 ], [ 4.906, 50.341 ], [ 4.905, 50.341 ], [ 4.905, 50.34 ] ] ] },
      area_m2: 7_900)
  end

  def plane(east: 0, north: 0)
    x0, y0 = Relief::Mercator.forward(4.9055, 50.3405)
    scale = Math.cos(50.3405 * Math::PI / 180)
    stub_identify(MNT, ->(x, y) { (200 + (x - x0) * scale * east + (y - y0) * scale * north).round(3) })
  end

  test "a slope rising to the north: it leans south, water runs to the south side" do
    plane(north: 0.1)
    reading = Trials::Reading.new(@trial, provider: instant_provider(@region)).call
    assert_in_delta 10, reading["slope_pct"], 0.5
    assert_equal "s", reading["downhill"]
    assert_equal "s", reading["low_side"]
    assert_in_delta 10, reading["drop_m"], 2
    assert_in_delta 50.34, reading["low_point"].last, 0.0003
    assert_equal 7_900, reading["area_m2"]
  end

  test "rising to the east: it leans west" do
    plane(east: 0.05)
    reading = Trials::Reading.new(@trial, provider: instant_provider(@region)).call
    assert_equal "w", reading["downhill"]
    assert_in_delta 5, reading["slope_pct"], 0.5
  end

  test "flat land has no downhill" do
    plane
    reading = Trials::Reading.new(@trial, provider: instant_provider(@region)).call
    assert_equal 0.0, reading["slope_pct"]
    assert_nil reading["downhill"]
  end

  test "around an address without parcel, a square is read" do
    plane(north: -0.08)
    @trial.update!(boundary: nil, area_m2: nil)
    reading = Trials::Reading.new(@trial, provider: instant_provider(@region)).call
    assert_equal "n", reading["downhill"]
    assert_nil reading["area_m2"]
  end

  test "no relief here, or the service is down: the area alone" do
    assert_equal({ "area_m2" => 7_900 }, Trials::Reading.new(@trial, provider: nil).call)
    stub_request(:post, "#{MNT}/identify").to_return(status: 503)
    assert_equal({ "area_m2" => 7_900 }, Trials::Reading.new(@trial, provider: instant_provider(@region)).call)
  end
end
