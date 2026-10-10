require "test_helper"

class Sun::HorizonProfileTest < ActiveSupport::TestCase
  test "linear between samples, wrapping through north" do
    profile = Sun::HorizonProfile.new([ [ 90, 10 ], [ 0, 2 ], [ 180, 4 ], [ 270, 6 ] ])

    assert_equal 10.0, profile.height_at(90)
    assert_equal 6.0, profile.height_at(45)
    assert_equal 7.0, profile.height_at(135)
    assert_equal 4.0, profile.height_at(315) # between 270 (6) and 360/0 (2)
    assert_equal 2.0, profile.height_at(360)
    assert_equal 6.0, profile.height_at(-315)
  end

  test "a single sample is a flat horizon; no sample is an error" do
    assert_equal 3.0, Sun::HorizonProfile.new([ [ 180, 3 ] ]).height_at(42)
    assert_raises(ArgumentError) { Sun::HorizonProfile.new([]) }
  end
end
