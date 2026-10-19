require "test_helper"
require_relative "../../test_helpers/climate_test_helper"

class Providers::ClimateTest < ActiveSupport::TestCase
  include ClimateTestHelper

  test "per capability: static data for the region, forecast from MET Norway until an Open-Meteo key is set" do
    region = seed_climate!
    provider = Providers::Climate.for(region, env: {})
    assert_equal({ normals: "static", projections: "static", forecast: "met_norway" }, provider.sources)
    assert_equal({ normals: true, projections: true, forecast: true }, provider.capabilities)

    with_key = Providers::Climate.for(region, env: { "OPEN_METEO_API_KEY" => "secret" })
    assert_equal "open_meteo", with_key.sources[:forecast]
    assert with_key.supports?(:forecast)
  end

  test "Open-Meteo named on its own stays off without its key" do
    region = seed_climate!
    assert_not Providers::Climate.for(region, env: { "CLIMATE_FORECAST_PROVIDER" => "open_meteo" }).supports?(:forecast)
    assert_equal "met_norway", Providers::Climate.for(region, env: { "CLIMATE_FORECAST_PROVIDER" => "met_norway", "OPEN_METEO_API_KEY" => "k" }).sources[:forecast]
  end

  test "ENV overrides the region's choice" do
    region = seed_climate!
    provider = Providers::Climate.for(region, env: { "OPEN_METEO_API_KEY" => "secret", "CLIMATE_FORECAST_PROVIDER" => "unavailable", "CLIMATE_PROJECTIONS_PROVIDER" => "none" })
    assert_not provider.supports?(:forecast)
    assert_not provider.supports?(:projections)
    assert provider.supports?(:normals)
    assert_equal :not_configured, provider.projection([ 4.9, 50.3 ], horizon: 2050, scenario: "high").reason
  end

  test "a region without climate data is unavailable, not broken" do
    provider = Providers::Climate.for(regions(:wallonia), env: {})
    result = provider.current_normals([ 4.9, 50.3 ])
    assert_not result.available?
    assert_equal :not_configured, result.reason
  end

  test "an unknown provider name is treated as unavailable" do
    region = seed_climate!
    region.update!(settings: region.settings.deep_merge("climate" => { "providers" => { "normals" => "meteo_magic" } }))
    assert_not Providers::Climate.for(region, env: {}).supports?(:normals)
  end
end
