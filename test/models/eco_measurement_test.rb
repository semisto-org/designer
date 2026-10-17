require "test_helper"

class EcoMeasurementTest < ActiveSupport::TestCase
  def measure(screen, at:, dom: 324, requests: 34, kilobytes: 2055)
    EcoMeasurement.create!(screen:, environment: "production", url: "https://terranova.semisto.org/", dom_elements: dom,
      requests:, bytes: kilobytes * 1024, measured_at: at)
  end

  test "computes score, grade, greenhouse gases and water from the counts" do
    row = measure("home", at: Time.current)
    assert_equal [ 69, "C" ], [ row.score, row.grade ]
    assert_in_delta 1.62, row.ges_grams, 0.01
    assert_in_delta 2.43, row.water_centiliters, 0.02
  end

  test "rejects an unknown screen or environment" do
    row = EcoMeasurement.new(screen: "nope", environment: "staging", url: "/", dom_elements: 1, requests: 1, bytes: 1, measured_at: Time.current)
    assert_not row.valid?
    assert row.errors.key?(:screen)
    assert row.errors.key?(:environment)
  end

  test "gives the last measurement of each screen, in page order, with its history oldest first" do
    measure("editor", at: 3.days.ago, requests: 130)
    measure("editor", at: 1.day.ago, requests: 80)
    measure("home", at: 2.days.ago)
    screens = EcoMeasurement.latest_with_history
    assert_equal %w[home editor], screens.pluck(:screen)
    editor = screens.last
    assert_equal 80, editor[:requests]
    assert_equal 2, editor[:history].size
    assert_operator editor[:history].first, :<, editor[:history].last
    assert_equal 2055, screens.first[:kilobytes]
  end

  test "keeps only the last scores in the history" do
    (EcoMeasurement::HISTORY + 3).times { |i| measure("help", at: i.hours.ago) }
    assert_equal EcoMeasurement::HISTORY, EcoMeasurement.latest_with_history.first[:history].size
  end
end
