require "test_helper"

class StorageClimateTest < ActiveSupport::TestCase
  def reading(**attrs)
    StorageReading.new(measured_on: Date.new(2026, 12, 1), **attrs)
  end

  test "Les 4 Sources' readings: too warm and too dry for keeping" do
    verdict = StorageClimate.verdict(reading(temperature_c: 20, humidity_pct: 60))
    assert_equal({ status: "bad", side: "warm" }, verdict[:temperature])
    assert_equal({ status: "bad", side: "dry" }, verdict[:humidity])
    assert_equal "bad", verdict[:overall]
  end

  test "a good cellar, a traditional one, a damp one" do
    assert_equal "good", StorageClimate.verdict(reading(temperature_c: 4, humidity_pct: 90))[:overall]
    assert_equal({ status: "fair", side: "warm" }, StorageClimate.verdict(reading(temperature_c: 7.5))[:temperature])
    assert_equal({ status: "fair", side: "wet" }, StorageClimate.verdict(reading(humidity_pct: 98))[:humidity])
    assert_equal({ status: "fair", side: "dry" }, StorageClimate.verdict(reading(humidity_pct: 80))[:humidity])
  end

  test "the min-max thermometer tells when it froze" do
    verdict = StorageClimate.verdict(reading(temperature_c: 3, temperature_min_c: -1.5, temperature_max_c: 5, humidity_pct: 90))
    assert_equal "frost", verdict[:temperature][:status]
    assert_equal "frost", verdict[:overall]
  end

  test "the summary keeps winter apart" do
    readings = [
      reading(temperature_c: 18, humidity_pct: 75).tap { _1.measured_on = Date.new(2026, 6, 1) },
      reading(temperature_min_c: 2, temperature_max_c: 7, humidity_pct: 88).tap { _1.measured_on = Date.new(2026, 12, 8) }
    ]
    summary = StorageClimate.summary(readings)
    assert_equal 2, summary[:readings]
    assert_equal 1, summary[:winterReadings]
    assert_equal 2.0, summary[:winterLowC]
    assert_equal 7.0, summary[:winterHighC]
    assert_equal "2026-12-08", summary[:latest][:measuredOn]
  end
end
