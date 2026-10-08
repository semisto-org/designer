require "test_helper"
require_relative "../../test_helpers/weather_stations_test_helper"

class WeatherStations::MapReportTest < ActiveSupport::TestCase
  include WeatherStationsTestHelper

  TODAY = Date.new(2026, 10, 8)

  setup do
    use_irm!
    @map = maps(:ahinvaux).reload
  end

  def report(**options) = WeatherStations::MapReport.new(@map, today: TODAY, **options).as_json

  test "not configured: one quiet reason, nothing called" do
    regions(:wallonia).update!(settings: {})
    assert_equal({ "available" => false, "reason" => "not_configured" }, WeatherStations::MapReport.new(@map.reload).as_json)
    assert_not_requested :any, /meteo\.be/
  end

  test "no location" do
    @map.update_columns(center: nil, boundary: nil)
    assert_equal({ "available" => false, "reason" => "no_location" }, report)
  end

  test "upstream error on the station list" do
    stub_request(:get, /opendata\.meteo\.be/).to_return(status: 500)
    assert_equal({ "available" => false, "reason" => "upstream_error" }, report)
  end

  test "nearest stations with distance, and the days of the nearest station that publishes them" do
    stub_irm_stations
    stub_irm_daily
    json = report

    assert json["available"]
    names = json["stations"].map { _1["name"] }
    assert_equal [ "Florennes", "Humain", "Ernage", "Dourbes" ], names
    florennes = json["stations"].first
    assert florennes["nearest"]
    assert_in_delta 21.6, florennes["distanceKm"], 0.2
    assert_equal %w[synop], florennes["networks"]
    assert_nil florennes["altitudeDiffM"] # no relief imported

    observed = json["observed"]
    assert observed["available"]
    assert_equal "Humain", observed["station"]["name"] # Florennes has no daily record
    assert_nil observed["chosen"]
    assert_equal 7, observed["days"].size
    assert_equal "2026-10-07", observed["days"].last["date"]
    assert_equal({ "name" => "IRM", "url" => "https://opendata.meteo.be", "licence" => "CC BY 4.0" }, json["attribution"])
  end

  test "summary: rain over 7 and 30 days, coldest night, frost" do
    stub_irm_stations
    stub_irm_daily
    summary = report["observed"]["summary"]
    assert_equal "2026-10-07", summary["lastDate"]
    assert_equal 7, summary["days7"]
    assert_equal 30, summary["days30"]
    assert_in_delta 13.31, summary["rain7Mm"], 0.05 # 0.69 on Oct 1 + 12.62 on Oct 7
    assert_equal({ "date" => "2026-10-06", "tminC" => 3.68 }, summary["coldestNight"])
    assert_not summary["frost7"]
    assert_equal 0, summary["frostNights30"]
  end

  test "frost is flagged when a night reaches 0 °C" do
    stub_irm_stations
    provider = Providers::WeatherStations::Irm.new
    day = Providers::WeatherStations::DailyObservation.new(date: "2026-10-05", tmin_c: -1.2, tmax_c: 9.0, tavg_c: 4.0, precip_mm: 0.0, soil_temp_10cm_c: 6.0, sun_hours: 3.0)
    provider.define_singleton_method(:daily) { |_code, since:| Providers::Climate::Result.ok([ day ], provider: "irm") }
    summary = WeatherStations::MapReport.new(@map, provider:, today: TODAY).as_json["observed"]["summary"]
    assert summary["frost7"]
    assert_equal 1, summary["frostNights30"]
    assert_equal({ "date" => "2026-10-05", "tminC" => -1.2 }, summary["coldestNight"])
  end

  test "a chosen station with daily data is the one observed" do
    stub_irm_stations
    request = stub_request(:get, WeatherStationsTestHelper::IRM_AWS)
      .with(query: hash_including("typenames" => "aws:aws_1day", "cql_filter" => "code=6455 AND timestamp >= '2026-09-08T00:00:00Z'"))
      .to_return(irm_json("aws_1day_6455.json"))
    observed = report(station: "6455")["observed"]
    assert_requested request
    assert_equal "Dourbes", observed["station"]["name"]
    assert_equal "Dourbes", observed["chosen"]["name"]
  end

  test "a chosen station without daily data falls back to the nearest one that has it" do
    stub_irm_stations
    stub_irm_daily
    observed = report(station: 6456)["observed"]
    assert_equal "Florennes", observed["chosen"]["name"]
    assert_equal "Humain", observed["station"]["name"]
  end

  test "observations unavailable keep the station list" do
    stub_irm_stations
    stub_request(:get, WeatherStationsTestHelper::IRM_AWS).with(query: hash_including("typenames" => "aws:aws_1day")).to_return(status: 502)
    json = report
    assert json["available"]
    assert_equal 4, json["stations"].size
    assert_equal false, json["observed"]["available"]
    assert_equal "upstream_error", json["observed"]["reason"]
  end

  test "altitude difference with the imported relief" do
    stub_irm_stations
    stub_irm_daily
    @map.create_terrain!(status: "ready", z_min: 100.0, z_max: 140.0)
    json = WeatherStations::MapReport.new(@map.reload, today: TODAY).as_json
    assert_equal 120, json["terrainAltitudeM"]
    assert_equal 168, json["stations"].first["altitudeDiffM"] # Florennes, 288.1 m
  end

  test "stations as GeoJSON, the nearest flagged" do
    stub_irm_stations
    geojson = WeatherStations::MapReport.new(@map).stations_geojson
    assert_equal "FeatureCollection", geojson["type"]
    assert_equal 29, geojson["features"].size
    nearest = geojson["features"].select { _1["properties"]["nearest"] }
    assert_equal [ 6456 ], nearest.map { _1["id"] }
    assert_equal [ 4.65296, 50.23458 ], nearest.first["geometry"]["coordinates"]
  end

  test "GeoJSON when not configured is an empty collection with its reason" do
    regions(:wallonia).update!(settings: {})
    geojson = WeatherStations::MapReport.new(@map.reload).stations_geojson
    assert_equal [], geojson["features"]
    assert_equal "not_configured", geojson["reason"]
  end
end
