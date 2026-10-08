require "test_helper"

class ObservedClimate::IndicatorsTest < ActiveSupport::TestCase
  Day = ObservedClimate::HourlySeries::Day

  # Twenty synthetic years, 2001-2020: mild days (5 to 15 °C, 1 mm of rain)
  # with, in year i (0-based), a frost on 10 January, a last spring frost on
  # day 100 + i and a first autumn frost on day 300 - i (days of a
  # non-leap year), the coldest night at -4 °C (even years) or -6 °C (odd
  # years), and 1 hot day a year in the first decade, 3 in the second.
  def synthetic_days
    (2001..2020).each_with_index.flat_map do |year, i|
      spring = Date.new(2001, 1, 1) + (100 + i - 1)
      autumn = Date.new(2001, 1, 1) + (300 - i - 1)
      frosts = [ [ 1, 10 ], [ spring.month, spring.day ], [ autumn.month, autumn.day ] ]
      hot = i < 10 ? [ [ 7, 15 ] ] : [ [ 7, 15 ], [ 7, 16 ], [ 8, 1 ] ]
      (Date.new(year, 1, 1)..Date.new(year, 12, 31)).map do |date|
        md = [ date.month, date.day ]
        tmin = if md == [ 1, 10 ] then i.even? ? -4.0 : -6.0
        elsif frosts.include?(md) then -1.0
        else 5.0
        end
        tmax = hot.include?(md) ? 32.0 : 15.0
        Day.new(date:, tmin:, tmax:, tmean: 12.0, precip_mm: 1.0)
      end
    end
  end

  def result = @result ||= ObservedClimate::Indicators.new(synthetic_days).as_json

  test "annual means, hardiness zone and months" do
    assert_equal 20, result[:years]
    assert_equal [ 2001, 2020 ], result.values_at(:first_year, :last_year)
    annual = result[:annual]
    assert_equal 12.0, annual[:mean_temp_c]
    assert_equal 365, annual[:rain_mm]
    assert_equal(-5.0, annual[:annual_min_c])
    assert_equal(-6.0, annual[:coldest_c])
    assert_equal 2.0, annual[:hot_days]
    assert_equal 3, annual[:frost_days]
    assert_in_delta 730.5, annual[:gdd_base10], 1 # 2 degree days a day, leap years included
    assert_equal "9a", result[:zone][:code] # -5 °C = 23 °F

    january = result[:months].first
    assert_equal({ month: 1, mean_temp_c: 12.0, mean_min_c: 4.7, mean_max_c: 15.0, rain_mm: 31 }, january)
    assert_equal 28, result[:months][1][:rain_mm] # 28.25 on average
  end

  test "frost dates: mean, 1 year in 5, frost-free season" do
    frost = result[:frost]
    # spring days 100..119: mean 109.5 -> day 110 = 20 April; 16th of 20 = day 115 = 25 April
    assert_equal({ mean: "04-20", late: "04-25", years_with: 20 }, frost[:last_spring])
    # autumn days 281..300: mean 290.5 -> day 291 = 18 October; 4th of 20 = day 284 = 11 October
    assert_equal({ mean: "10-18", early: "10-11", years_with: 20 }, frost[:first_autumn])
    assert_equal 180, frost[:frost_free_days] # 199 - 2i on average
  end

  test "trend between the first and the last decade" do
    trend = result[:trend]
    assert_equal [ 2001, 2010 ], trend[:first].values_at(:from, :to)
    assert_equal [ 2011, 2020 ], trend[:last].values_at(:from, :to)
    assert_equal 2.0, trend[:delta][:hot_days]
    assert_equal 10, trend[:delta][:last_spring_frost_doy]
    assert_equal(-10, trend[:delta][:first_autumn_frost_doy])
    assert_equal(-20, trend[:delta][:frost_free_days])
    assert_equal 0.0, trend[:delta][:mean_temp_c]
  end

  test "years without frost, incomplete years, short series" do
    warm = (Date.new(2001, 1, 1)..Date.new(2001, 12, 31)).map { Day.new(date: _1, tmin: 8.0, tmax: 20.0, tmean: 14.0, precip_mm: 0.5) }
    partial = (Date.new(2002, 1, 1)..Date.new(2002, 6, 30)).map { Day.new(date: _1, tmin: -3.0, tmax: 5.0, tmean: 1.0, precip_mm: 0.5) }
    result = ObservedClimate::Indicators.new(warm + partial).as_json
    assert_equal 1, result[:years]
    assert_equal({ mean: nil, late: nil, years_with: 0 }, result[:frost][:last_spring])
    assert_equal({ mean: nil, early: nil, years_with: 0 }, result[:frost][:first_autumn])
    assert_equal 365, result[:frost][:frost_free_days]
    assert_nil result[:trend]
    assert_equal({ years: 0 }, ObservedClimate::Indicators.new([]).as_json)
  end
end
