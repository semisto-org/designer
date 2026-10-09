require "test_helper"
require_relative "../../test_helpers/weather_stations_test_helper"

class Providers::WeatherStationsTest < ActiveSupport::TestCase
  include WeatherStationsTestHelper

  test "a region without a provider is not configured and calls nothing" do
    provider = Providers::WeatherStations.for(regions(:wallonia))
    assert_not provider.configured?
    assert_equal :not_configured, provider.stations.reason
    assert_equal :not_configured, provider.daily(6455, since: Date.current).reason
    assert_not_requested :any, /meteo\.be/
  end

  test "the region's setting picks the IRM, ENV overrides it" do
    use_irm!
    assert_kind_of Providers::WeatherStations::Irm, Providers::WeatherStations.for(regions(:wallonia).reload)
    assert_kind_of Providers::WeatherStations::Unavailable,
      Providers::WeatherStations.for(regions(:wallonia), env: { "WEATHER_STATIONS_PROVIDER" => "none" })
    assert_kind_of Providers::WeatherStations::Irm, Providers::WeatherStations.for(nil, env: { "WEATHER_STATIONS_PROVIDER" => "irm" })
  end

  test "IRM stations: both networks merged by code, closed stations left out, names in title case" do
    stub_irm_stations
    result = Providers::WeatherStations::Irm.new.stations
    assert result.available?
    stations = result.data.index_by(&:code)

    assert_equal 29, stations.size # 14 AWS + 30 SYNOP, 14 shared codes, one closed SYNOP station (6446)
    dourbes = stations.fetch(6455)
    assert_equal "Dourbes", dourbes.name
    assert_equal %w[aws synop], dourbes.networks
    assert dourbes.daily
    assert_in_delta 234.8, dourbes.altitude_m
    assert_equal [ 4.595, 50.096 ], [ dourbes.lng, dourbes.lat ]

    florennes = stations.fetch(6456)
    assert_equal %w[synop], florennes.networks
    assert_not florennes.daily
    assert_equal "Spa (Aerodrome)", stations.fetch(6490).name
    assert_equal "Sint-Katelijne-Waver", stations.fetch(6439).name
    assert_equal %w[aws], stations.fetch(10101002).networks
    assert_not stations.key?(6446)
  end

  test "IRM daily: filtered by station and date, rain in mm, sunshine in hours, soil at 10 cm" do
    request = stub_request(:get, WeatherStationsTestHelper::IRM_AWS)
      .with(query: hash_including("typenames" => "aws:aws_1day", "cql_filter" => "code=6455 AND timestamp >= '2026-09-08T00:00:00Z'"))
      .to_return(irm_json("aws_1day_6455.json"))
    result = Providers::WeatherStations::Irm.new.daily("6455", since: Date.new(2026, 9, 8))
    assert_requested request
    assert result.available?
    days = result.data
    assert_equal 30, days.size
    last = days.last
    assert_equal "2026-10-07", last.date
    assert_in_delta 6.25, last.tmin_c
    assert_in_delta 23.26, last.tmax_c
    assert_in_delta 12.62, last.precip_mm
    assert_in_delta 6.4, last.sun_hours # 382.67 minutes
    assert_in_delta 16.51, last.soil_temp_10cm_c
  end

  test "daily refuses a code that is not a number (no CQL injection)" do
    assert_raises(ArgumentError) { Providers::WeatherStations::Irm.new.daily("6455 OR 1=1", since: Date.current) }
  end

  test "an upstream failure is reported, not cached" do
    stub_request(:get, WeatherStationsTestHelper::IRM_AWS).to_return(status: 503, body: "down")
    stub_request(:get, WeatherStationsTestHelper::IRM_SYNOP).to_return(status: 503, body: "down")
    with_memory_cache do
      provider = Providers::WeatherStations::Irm.new
      assert_equal :upstream_error, provider.stations.reason
      WebMock.reset!
      stub_irm_stations
      assert provider.stations.available?
    end
  end

  test "timeouts are reported as upstream errors" do
    stub_request(:get, WeatherStationsTestHelper::IRM_AWS).to_timeout
    assert_equal :upstream_error, Providers::WeatherStations::Irm.new.daily(6455, since: Date.current).reason
  end

  test "stations are cached a day, observations an hour" do
    stub_irm_stations
    stub_irm_daily
    with_memory_cache do
      provider = Providers::WeatherStations::Irm.new
      2.times { provider.stations }
      2.times { provider.daily(6455, since: Date.new(2026, 9, 8)) }
      assert_requested :get, WeatherStationsTestHelper::IRM_AWS, times: 2 # station list + days, once each
      travel 2.hours do
        provider.daily(6455, since: Date.new(2026, 9, 8))
        provider.stations
      end
      assert_requested :get, WeatherStationsTestHelper::IRM_AWS, times: 3
    end
  end

  test "IRM_OPENDATA_URL changes the base URL" do
    stub_request(:get, %r{\Ahttps://mirror\.example/irm/aws/wfs}).to_return(irm_json("aws_1day_6455.json"))
    provider = Providers::WeatherStations::Irm.from_env("IRM_OPENDATA_URL" => "https://mirror.example/irm/")
    assert provider.daily(6455, since: Date.new(2026, 9, 8)).available?
  end
end
