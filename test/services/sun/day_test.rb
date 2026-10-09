require "test_helper"

class Sun::DayTest < ActiveSupport::TestCase
  def day(date, horizon) = Sun::Day.new(lat: 50.32, lng: 4.88, date:, horizon:)

  test "a flat horizon gives the open-sky hours" do
    winter = day(Date.new(2026, 12, 21), ->(_) { 0.0 })
    assert_in_delta 7.93, winter.open_minutes / 60.0, 0.05
    assert_equal winter.open_minutes, winter.terrain_minutes
    # Symmetric around solar noon.
    assert_equal 24 * 60, winter.first_sun + winter.last_sun
  end

  test "a hill to the south-east hides the winter morning" do
    hill = Sun::HorizonProfile.new([ [ 0, 0 ], [ 90, 0 ], [ 135, 12 ], [ 180, 0 ], [ 270, 0 ] ])
    winter = day(Date.new(2026, 12, 21), hill.to_proc)

    assert_operator winter.terrain_minutes, :<, winter.open_minutes
    assert_operator winter.first_sun, :>, (24 * 60) - winter.last_sun # starts late, ends as usual
  end

  test "a horizon above the sun: no direct sun, no first or last time" do
    winter = day(Date.new(2026, 12, 21), ->(_) { 20.0 })
    assert_equal 0, winter.terrain_minutes
    assert_nil winter.first_sun
    assert_nil winter.last_sun
  end

  test "without a horizon: open-sky hours only" do
    summer = day(Date.new(2026, 6, 21), nil)
    assert_nil summer.terrain_minutes
    assert_nil summer.first_sun
    assert_in_delta 16.33, summer.open_minutes / 60.0, 0.05
  end

  test "the path is drawn every 10 minutes, from just below the horizon" do
    path = day(Date.new(2026, 3, 20), nil).path
    assert(path.all? { _1[:minutes] % 10 == 0 })
    assert_operator path.first[:elevation], :<, 0
    assert_in_delta 39.7, path.max_by { _1[:elevation] }[:elevation], 0.1
  end
end
