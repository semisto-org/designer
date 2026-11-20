require "test_helper"

class ObservedClimate::WindTest < ActiveSupport::TestCase
  Hour = ObservedClimate::HourlySeries::WindHour

  # A year of hours: west winds most of the time, a cold north-east bise on
  # spring nights, a few storms from the south-west, some calm.
  def hours
    Date.new(1995, 1, 1).step(Date.new(1995, 12, 31)).flat_map do |date|
      (0..23).map do |hour|
        spring = (3..5).cover?(date.month)
        if spring && hour < 6 then Hour.new(month: date.month, speed: 4.0, from_deg: 45, temp_c: 1.0)
        elsif [ 14, 15 ].include?(date.day) && hour < 12 then Hour.new(month: date.month, speed: 15.0, from_deg: 225, temp_c: 10.0)
        elsif hour == 23 then Hour.new(month: date.month, speed: 0.2, from_deg: 180, temp_c: 8.0)
        else Hour.new(month: date.month, speed: 5.0, from_deg: 268, temp_c: 12.0)
        end
      end
    end
  end

  test "roses for the year and each season, the cold spring wind and the strongest winds" do
    wind = ObservedClimate::Wind.new(hours).as_json
    assert_equal 8760, wind[:hours]
    assert_equal [ 10, 20, 30 ], wind[:classes_kmh]

    year = wind[:year]
    assert_equal 270.0, year[:prevailing_deg]
    assert_in_delta 100 / 24.0, year[:calm_pct], 0.1
    west = year[:sectors][12]
    assert_equal 270.0, west[:deg]
    assert_equal 18.0, west[:mean_kmh]
    # 18 km/h falls in the second class (10 to 20 km/h).
    assert_equal west[:pct], west[:classes][1]
    assert_in_delta 100.0, year[:sectors].sum { _1[:pct] } + year[:calm_pct], 0.5

    assert_equal %i[winter spring summer autumn], wind[:seasons].keys
    assert_equal 270.0, wind[:seasons][:summer][:prevailing_deg]

    cold = wind[:cold_spring]
    assert_equal 45.0, cold[:prevailing_deg]
    assert_in_delta 25.0, cold[:hours_pct], 0.1
    assert_equal 100.0, cold[:north_east_pct]

    strong = wind[:strong]
    assert_equal 98, strong[:percentile]
    assert_equal 225.0, strong[:prevailing_deg]
    assert_equal 54.0, strong[:max_kmh]
  end

  test "a direction is where the wind comes from, in 16 points" do
    assert_equal 0, ObservedClimate::Wind.direction(355)
    assert_equal 0, ObservedClimate::Wind.direction(11)
    assert_equal 1, ObservedClimate::Wind.direction(12)
    assert_equal 12, ObservedClimate::Wind.direction(270)
  end

  test "too few hours make no rose" do
    assert_nil ObservedClimate::Wind.new([ Hour.new(month: 1, speed: 3, from_deg: 270, temp_c: 2) ]).as_json
  end
end
