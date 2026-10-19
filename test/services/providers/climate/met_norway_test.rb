require "test_helper"

class Providers::Climate::MetNorwayTest < ActiveSupport::TestCase
  ENDPOINT = %r{\Ahttps://api\.met\.no/weatherapi/locationforecast/2\.0/complete}

  setup { @provider = Providers::Climate::MetNorway.new }

  def stub_forecast(status: 200, body: file_fixture("met_norway/forecast.json").read)
    stub_request(:get, ENDPOINT).to_return(status:, body:, headers: { "Content-Type" => "application/json" })
  end

  test "asks with a User-Agent and four decimals, and gathers the steps into local days" do
    stub = stub_forecast
    result = @provider.forecast([ 4.906123, 50.341987 ])

    assert_requested(:get, ENDPOINT) do |request|
      request.headers["User-Agent"].include?("semisto") &&
        request.uri.query_values == { "lat" => "50.342", "lon" => "4.9061" }
    end
    assert_requested stub
    assert result.available?
    days = result.data[:days]
    assert_equal %w[2026-10-20 2026-10-21 2026-10-22], days.map { _1[:date] }
    first = days.first
    assert_equal(-1.8, first[:tmin_c])
    assert_equal 3.8, first[:tmax_c]
    assert_equal 0.4, first[:precip_mm], "hourly amounts, not the overlapping six-hourly ones"
    assert_equal 1, first[:weather_code], "« fair » around noon"
    assert_equal 33, first[:precip_probability_pct]
    assert_equal 26.3, first[:wind_gusts_kmh]
    assert_equal 80, days.last[:weather_code]
    assert_equal "MET Norway", result.data[:attribution][:name]
    assert_equal 186, result.data[:elevation_m]
  end

  test "an error, a timeout or a strange body is unavailable, not broken" do
    stub_forecast(status: 503, body: "")
    assert_equal :upstream_error, @provider.forecast([ 4.9, 50.3 ]).reason

    stub_request(:get, ENDPOINT).to_timeout
    assert_equal :upstream_error, @provider.forecast([ 4.9, 50.3 ]).reason

    stub_forecast(body: { "properties" => {} }.to_json)
    assert_equal :upstream_error, @provider.forecast([ 4.9, 50.3 ]).reason
  end

  test "no place, no call" do
    assert_equal :no_location, @provider.forecast(nil).reason
    assert_not_requested :any, //
  end

  test "a thunderstorm reads as one" do
    body = JSON.parse(file_fixture("met_norway/forecast.json").read)
    body["properties"]["timeseries"].each { _1["data"]["next_6_hours"]["summary"]["symbol_code"] = "heavyrainandthunder" }
    stub_forecast(body: body.to_json)
    assert_equal 95, @provider.forecast([ 4.9, 50.3 ]).data[:days].first[:weather_code]
  end
end
