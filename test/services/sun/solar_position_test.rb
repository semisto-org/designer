require "test_helper"

class Sun::SolarPositionTest < ActiveSupport::TestCase
  YVOIR = { lat: 50.32, lng: 4.88 }.freeze

  def declination(date) = Sun::SolarPosition.declination(Sun::SolarPosition.julian_day(date) + 0.5)

  test "declination at the solstices and the equinox" do
    assert_in_delta 23.44, declination(Date.new(2026, 6, 21)), 0.02
    assert_in_delta(-23.44, declination(Date.new(2026, 12, 21)), 0.02)
    # March equinox 2026: 20 March 14:46 UT, so just below zero at noon.
    assert_in_delta 0.0, declination(Date.new(2026, 3, 20)), 0.1
    assert_operator declination(Date.new(2026, 3, 20)), :<, 0
  end

  test "NOAA reference: declination on 2010-06-21 at 6:06 UT" do
    # NOAA_Solar_Calculations_day.xls, first row (2010-06-21 0:06 local, time zone -6): 23.4382.
    jd = Sun::SolarPosition.julian_day(Date.new(2010, 6, 21)) + (6.1 / 24)
    assert_in_delta 23.4382, Sun::SolarPosition.declination(jd), 0.001
  end

  test "noon: due south, at 90 - latitude + declination (refraction included)" do
    summer = Sun::SolarPosition.at(**YVOIR, date: Date.new(2026, 6, 21), solar_hours: 12)
    winter = Sun::SolarPosition.at(**YVOIR, date: Date.new(2026, 12, 21), solar_hours: 12)

    assert_in_delta 180.0, summer.azimuth, 0.01
    # PVGIS draws the same paths: 63.1 and 16.2 (without refraction).
    assert_in_delta 63.1, summer.elevation, 0.05
    assert_in_delta 16.3, winter.elevation, 0.1
  end

  test "morning in the east, afternoon in the west, symmetric around noon" do
    morning = Sun::SolarPosition.at(**YVOIR, date: Date.new(2026, 6, 21), solar_hours: 9)
    afternoon = Sun::SolarPosition.at(**YVOIR, date: Date.new(2026, 6, 21), solar_hours: 15)

    assert_operator morning.azimuth, :<, 180
    assert_operator afternoon.azimuth, :>, 180
    assert_in_delta 360 - morning.azimuth, afternoon.azimuth, 0.1
    assert_in_delta morning.elevation, afternoon.elevation, 0.05
  end

  test "summer solstice: the sun rises in the north-east, as PVGIS draws it" do
    day = Sun::Day.new(**YVOIR, date: Date.new(2026, 6, 21))
    sunrise = day.path.find { _1[:elevation] >= 0 }
    # PVGIS: azimuth -127.4 from the south (52.6 from the north) at 0.8 degree.
    assert_in_delta 52.6, sunrise[:azimuth], 2.0
  end

  test "day length matches the closed-form sunrise equation" do
    [ [ 6, 21 ], [ 12, 21 ], [ 3, 20 ] ].each do |month, day|
      date = Date.new(2026, month, day)
      decl = declination(date) * Math::PI / 180
      lat = YVOIR[:lat] * Math::PI / 180
      h0 = -0.5667 * Math::PI / 180 # refraction at the horizon
      half = Math.acos((Math.sin(h0) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl)))
      expected_hours = 2 * half * 180 / Math::PI / 15

      assert_in_delta expected_hours, Sun::Day.new(**YVOIR, date:).open_minutes / 60.0, 0.06, "on #{date}"
    end
  end

  test "refraction lifts the sun by about half a degree at the horizon, nothing near the zenith" do
    assert_in_delta 0.48, Sun::SolarPosition.refraction(0.0), 0.01
    assert_equal 0.0, Sun::SolarPosition.refraction(89.0)
  end
end
