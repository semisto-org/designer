require "test_helper"
require_relative "../../test_helpers/climate_test_helper"

class Providers::ClimateTest < ActiveSupport::TestCase
  include ClimateTestHelper

  test "per capability: static data for the region, forecast only with a commercial key" do
    region = seed_climate!
    provider = Providers::Climate.for(region, env: {})
    assert_equal({ normals: "static", projections: "static", forecast: "open_meteo" }, provider.sources)
    assert_equal({ normals: true, projections: true, forecast: false }, provider.capabilities)

    with_key = Providers::Climate.for(region, env: { "OPEN_METEO_API_KEY" => "secret" })
    assert with_key.supports?(:forecast)
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
