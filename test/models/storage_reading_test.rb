require "test_helper"

class StorageReadingTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @cellar = @map.features.create!(layer: "structures", kind: "fruit_store", name: "Cave", geometry: point, properties: { "store_type" => "cellar" })
  end

  test "a reading belongs to a store and its map" do
    reading = @cellar.storage_readings.create!(measured_on: Date.new(2026, 10, 3), temperature_c: 18, humidity_pct: 70)
    assert_equal @map, reading.map
    assert_equal [ reading ], @map.storage_readings.to_a
    json = reading.as_json
    assert_equal "2026-10-03", json[:measuredOn]
    assert_equal 18.0, json[:temperatureC]
    assert_equal "bad", json[:verdict][:overall]
  end

  test "something must be measured, the min under the max, never in the future" do
    refute @cellar.storage_readings.new(measured_on: Date.current).valid?
    refute @cellar.storage_readings.new(measured_on: Date.current, temperature_min_c: 8, temperature_max_c: 4).valid?
    refute @cellar.storage_readings.new(measured_on: Date.current + 3, humidity_pct: 90).valid?
    refute @cellar.storage_readings.new(measured_on: Date.current, humidity_pct: 120).valid?
    assert @cellar.storage_readings.new(measured_on: Date.current, humidity_pct: 90).valid?
  end

  test "only a fruit store takes readings" do
    refute map_features(:pond).storage_readings.new(measured_on: Date.current, humidity_pct: 90).valid?
  end

  test "deleting the store deletes its readings" do
    @cellar.storage_readings.create!(measured_on: Date.current, humidity_pct: 90)
    assert_difference -> { StorageReading.count }, -1 do
      @cellar.destroy!
    end
  end
end
