require "test_helper"
require_relative "../../../test_helpers/climate_test_helper"

class Providers::Climate::OpenMeteoTest < ActiveSupport::TestCase
  include ClimateTestHelper

  FORECAST = %r{\Ahttps://customer-api\.open-meteo\.com/v1/forecast}

  def fixture = file_fixture("open_meteo/forecast.json").read

  test "not configured without a key: the free API is never called" do
    provider = Providers::Climate::OpenMeteo.new(api_key: nil)
    assert_not provider.configured?
    assert_equal :not_configured, provider.forecast([ 4.9, 50.34 ]).reason
    assert_not_requested :any, /open-meteo\.com/
  end

  test "refuses the free endpoints even when configured by mistake" do
    %w[https://api.open-meteo.com https://archive-api.open-meteo.com https://climate-api.open-meteo.com].each do |url|
      provider = Providers::Climate::OpenMeteo.new(api_key: "key", base_url: url)
      assert_not provider.configured?, url
      assert_equal :not_configured, provider.forecast([ 4.9, 50.34 ]).reason
    end
    assert_not_requested :any, /open-meteo\.com/
  end

  test "daily forecast from the commercial customer API" do
    stub = stub_request(:get, FORECAST)
      .with(query: hash_including("apikey" => "secret", "latitude" => "50.34", "longitude" => "4.9", "forecast_days" => "7", "timezone" => "Europe/Brussels"))
      .to_return(status: 200, body: fixture, headers: { "Content-Type" => "application/json; charset=utf-8" })
    result = Providers::Climate::OpenMeteo.new(api_key: "secret").forecast([ 4.9, 50.34 ])

    assert result.available?
    assert_requested stub
    days = result.data[:days]
    assert_equal 7, days.size
    assert_equal({ date: "2026-10-08", weather_code: 0, tmax_c: 16.3, tmin_c: -1.8, precip_mm: 0.0, precip_probability_pct: 5, wind_gusts_kmh: 15.0 }, days[4])
    assert_equal "CC BY 4.0", result.data[:attribution][:licence]
  end

  test "a self-hosted instance needs no key" do
    stub = stub_request(:get, %r{\Ahttps://meteo\.semisto\.example/v1/forecast}).to_return(status: 200, body: fixture, headers: { "Content-Type" => "application/json" })
    provider = Providers::Climate::OpenMeteo.new(api_key: nil, base_url: "https://meteo.semisto.example/")
    assert provider.configured?
    assert provider.forecast([ 4.9, 50.34 ]).available?
    assert_requested stub
  end

  test "upstream errors and timeouts degrade to unavailable, and are not cached" do
    provider = Providers::Climate::OpenMeteo.new(api_key: "secret")
    with_memory_cache do
      stub_request(:get, FORECAST).to_return(status: 500, body: "oops")
      assert_equal :upstream_error, provider.forecast([ 4.9, 50.34 ]).reason

      stub_request(:get, FORECAST).to_timeout
      assert_equal :upstream_error, provider.forecast([ 4.9, 50.34 ]).reason

      stub_request(:get, FORECAST).to_return(status: 200, body: "{}", headers: { "Content-Type" => "application/json" })
      assert_equal :upstream_error, provider.forecast([ 4.9, 50.34 ]).reason

      stub_request(:get, FORECAST).to_return(status: 200, body: fixture, headers: { "Content-Type" => "application/json" })
      assert provider.forecast([ 4.9, 50.34 ]).available?
    end
  end

  test "caches the forecast for an hour around a location" do
    stub = stub_request(:get, FORECAST).to_return(status: 200, body: fixture, headers: { "Content-Type" => "application/json" })
    provider = Providers::Climate::OpenMeteo.new(api_key: "secret")
    with_memory_cache do
      provider.forecast([ 4.9001, 50.3401 ])
      provider.forecast([ 4.9002, 50.3402 ])
      assert_requested stub, times: 1
      travel 61.minutes do
        provider.forecast([ 4.9001, 50.3401 ])
      end
      assert_requested stub, times: 2
    end
  end

  test "only the forecast is supported" do
    provider = Providers::Climate::OpenMeteo.new(api_key: "secret")
    assert provider.supports?(:forecast)
    assert_not provider.supports?(:normals)
    assert_equal :not_supported, provider.current_normals([ 4.9, 50.3 ]).reason
  end
end
