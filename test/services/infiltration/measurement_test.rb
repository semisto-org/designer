require "test_helper"

class Infiltration::MeasurementTest < ActiveSupport::TestCase
  def readings(*pairs) = pairs.map { |minutes, depth| { "t_s" => minutes * 60, "depth_cm" => depth } }

  test "a ring gives the drop in height over the time" do
    result = Infiltration::Measurement.new(method: "ring", diameter_cm: 15, readings: readings([ 0, 10 ], [ 10, 8 ], [ 20, 6 ], [ 30, 4 ])).call

    assert_equal [ 120.0 ] * 3, result.intervals.map { |i| i.rate_mm_h.round(6) }
    assert_equal 120.0, result.rate_mm_h
    assert result.stable
    assert_equal "rapid", result.rate_class
  end

  test "a hole follows Porchet: the walls drink too, so the rate is lower than the drop" do
    # 30 cm hole: r/2 = 75 mm; from 250 to 230 mm in 15 min.
    result = Infiltration::Measurement.new(method: "hole", diameter_cm: 30, readings: readings([ 0, 25 ], [ 15, 23 ], [ 30, 21.1 ], [ 45, 19.3 ])).call

    first = 75 * Math.log((250 + 75) / (230 + 75.0)) / 0.25
    assert_in_delta first, result.intervals.first.rate_mm_h, 1e-9
    assert_in_delta 19.0, first, 0.2
    assert result.stable
    assert_in_delta result.intervals.sum(&:rate_mm_h) / 3, result.rate_mm_h, 0.05
    assert_equal "moderate", result.rate_class
  end

  test "a soil still soaking up is not stable: the last interval is given, marked so" do
    result = Infiltration::Measurement.new(method: "ring", diameter_cm: 15, readings: readings([ 0, 20 ], [ 10, 14 ], [ 20, 11 ], [ 30, 9 ])).call

    refute result.stable
    assert_in_delta 120.0, result.rate_mm_h, 0.01
  end

  test "a hole filled again starts a new series" do
    result = Infiltration::Measurement.new(method: "ring", diameter_cm: 15, readings: readings([ 0, 5 ], [ 10, 1 ], [ 12, 10 ], [ 22, 9 ], [ 32, 8 ])).call

    assert_equal 3, result.intervals.size
    assert_equal [ 0, 720, 1320 ], result.intervals.map(&:from_s)
    assert_in_delta 60.0, result.rate_mm_h, 0.01
  end

  test "one interval is not yet a rate, and water that does not move is a rate of zero" do
    assert_nil Infiltration::Measurement.new(method: "ring", diameter_cm: 15, readings: readings([ 0, 10 ], [ 10, 9 ])).call.rate_mm_h

    still = Infiltration::Measurement.new(method: "hole", diameter_cm: 30, readings: readings([ 0, 20 ], [ 30, 20 ], [ 60, 20 ], [ 90, 20 ])).call
    assert_equal 0.0, still.rate_mm_h
    assert still.stable
    assert_equal "very_slow", still.rate_class
  end

  test "cleans readings and refuses malformed ones" do
    assert_equal [ { "t_s" => 0, "depth_cm" => 25.0 }, { "t_s" => 600, "depth_cm" => 22.5 } ],
                 Infiltration::Measurement.clean_readings([ { "t_s" => "0", "depth_cm" => 25 }, { "t_s" => 600.2, "depth_cm" => "22.5" } ])
    assert_equal [], Infiltration::Measurement.clean_readings(nil)
    assert_nil Infiltration::Measurement.clean_readings("readings")
    assert_nil Infiltration::Measurement.clean_readings([ { "t_s" => 600, "depth_cm" => 20 }, { "t_s" => 300, "depth_cm" => 18 } ])
    assert_nil Infiltration::Measurement.clean_readings([ { "t_s" => 0, "depth_cm" => -1 } ])
    assert_nil Infiltration::Measurement.clean_readings([ { "t_s" => 0 } ])
  end
end
