require "test_helper"
require "test_helpers/water_balance_test_helper"

class WaterBalance::ModelTest < ActiveSupport::TestCase
  include WaterBalanceTestHelper

  test "in the Condroz, winter rain overflows the soil and summer draws on it" do
    result = WaterBalance::Model.new(months: YVOIR_MONTHS, latitude: 50.3, reserve_mm: 150).call
    months = result[:months].index_by { _1[:month] }

    assert_in_delta 115, months[7][:pet_mm], 15, "a July of about 3.5 to 4 mm a day"
    assert_operator months[1][:pet_mm], :<, 20
    assert_in_delta 650, result[:annual][:pet_mm], 80
    assert_equal 925, result[:annual][:rain_mm]
    assert_operator months[12][:surplus_mm], :>, 50
    assert_equal 0, months[7][:surplus_mm]
    assert_operator months[8][:soil_mm], :<, 100, "the reserve is half spent by the end of summer"
    assert_equal [ 6, 7, 8 ], result[:dry_months]
    # Over a year in balance, rain = evapotranspiration + surplus.
    actual = result[:months].sum { _1[:aet_mm] }
    assert_in_delta result[:annual][:rain_mm], actual + result[:annual][:surplus_mm], 12
  end

  test "a soil with no reserve passes on every surplus and feels every shortfall" do
    result = WaterBalance::Model.new(months: YVOIR_MONTHS, latitude: 50.3, reserve_mm: 0).call
    result[:months].each do |m|
      assert_in_delta [ m[:pet_mm] - m[:rain_mm], 0 ].max, m[:deficit_mm], 1
      assert_in_delta [ m[:rain_mm] - m[:pet_mm], 0 ].max, m[:surplus_mm], 1
    end
  end

  test "a hotter, drier summer deepens the deficit" do
    hotter = YVOIR_MONTHS.map { |m| m.merge("mean_temp_c" => m["mean_temp_c"] + 2, "mean_min_c" => m["mean_min_c"] + 2, "mean_max_c" => m["mean_max_c"] + 2) }
    hotter = hotter.map { |m| [ 6, 7, 8 ].include?(m["month"]) ? m.merge("rain_mm" => m["rain_mm"] * 0.8) : m }
    today = WaterBalance::Model.new(months: YVOIR_MONTHS, latitude: 50.3, reserve_mm: 150).call
    later = WaterBalance::Model.new(months: hotter, latitude: 50.3, reserve_mm: 150).call
    assert_operator later[:annual][:deficit_mm], :>, today[:annual][:deficit_mm] * 2
  end
end
