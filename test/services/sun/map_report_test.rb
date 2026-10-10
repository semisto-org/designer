require "test_helper"
require_relative "../../test_helpers/sun_test_helper"

class Sun::MapReportTest < ActiveSupport::TestCase
  include SunTestHelper

  setup { @map = maps(:ahinvaux) }

  def report(provider: Providers::Pvgis.build({})) = Sun::MapReport.new(@map, provider:, year: 2026).as_json

  test "horizon, three sun paths, twelve months and irradiation" do
    stub_pvgis
    json = report

    assert json["available"]
    assert_equal({ "lng" => 4.9075, "lat" => 50.341 }, json["location"])
    assert json["horizon"]["available"]
    assert_equal 48, json["horizon"]["profile"].size
    assert_equal({ "azimuth" => 0.0, "height" => 7.3 }, json["horizon"]["profile"].first)
    assert_equal 110.0, json["horizon"]["elevationM"]

    assert_equal %w[winter_solstice equinox summer_solstice], json["paths"].map { _1["key"] }
    winter, _, summer = json["paths"]
    assert_equal "2026-12-21", winter["date"]
    assert_in_delta 16.3, winter["noonElevation"], 0.3
    assert_in_delta 63.1, summer["noonElevation"], 0.3
    assert(summer["points"].all? { _1.keys == %w[minutes azimuth elevation] })

    assert_equal 12, json["months"].size
    december = json["months"].last
    assert_equal "2026-12-21", december["date"]
    assert_operator december["terrainHours"], :<, december["openHours"]
    assert_operator december["firstSun"], :>, 8 * 60
    assert_equal 23.7, json["months"].first["irradiationKwhM2"]

    assert_equal({ "available" => true, "annualKwhM2" => 1076, "yearMin" => 2005, "yearMax" => 2023, "database" => "PVGIS-SARAH3" }, json["irradiation"])
    assert_equal %w[noaa pvgis], json["sources"].map { _1["key"] }
    assert_match(/\APVGIS © European Communities, 2001-\d{4}\z/, json["sources"].last["publisher"])
  end

  test "without a location: says so and calls nothing" do
    @map.center = nil
    json = report
    assert_equal({ "location" => nil, "available" => false, "reason" => "no_location" }, json)
    assert_not_requested :any, /jrc\.ec\.europa\.eu/
  end

  test "PVGIS off: sun paths and open-sky hours stay, the rest says why" do
    json = report(provider: Providers::Pvgis.build({ "PVGIS_PROVIDER" => "none" }))

    assert json["available"]
    assert_equal({ "available" => false, "reason" => "not_configured" }, json["horizon"])
    assert_equal({ "available" => false, "reason" => "not_configured" }, json["irradiation"])
    assert_equal 3, json["paths"].size
    assert(json["months"].all? { _1["openHours"].positive? && _1["terrainHours"].nil? && _1["irradiationKwhM2"].nil? })
    assert_equal %w[noaa], json["sources"].map { _1["key"] }
  end

  test "one PVGIS call failing does not hide the other" do
    stub_pvgis_horizon
    stub_pvgis_irradiation(status: 500, body: "")
    json = report

    assert json["horizon"]["available"]
    assert_equal "upstream_error", json["irradiation"]["reason"]
    assert json["months"].first["terrainHours"]
  end
end
