require "test_helper"
require_relative "../../test_helpers/sun_test_helper"

class Providers::PvgisTest < ActiveSupport::TestCase
  include SunTestHelper

  POINT = Providers::Climate::Point.build(4.88042, 50.32018)

  test "horizon: compass azimuths from north, heights in degrees" do
    stub = stub_request(:get, "https://re.jrc.ec.europa.eu/api/v5_3/printhorizon")
      .with(query: { "lat" => "50.32", "lon" => "4.88", "outputformat" => "json" })
      .to_return(status: 200, body: file_fixture("sun/printhorizon.json").read)
    horizon = Providers::Pvgis.build({}).horizon(POINT)

    assert_requested stub
    assert_equal 48, horizon.profile.size # -180 and 180 are the same north point
    assert_equal [ 0.0, 7.3 ], horizon.profile.first
    # PVGIS -90 (east) is compass 90, its 0 (south) is compass 180.
    assert_equal 26.7, horizon.profile.to_h[90.0]
    assert_equal 2.3, horizon.profile.to_h[180.0]
    assert_equal 110.0, horizon.elevation_m
    assert_equal "DEM-calculated", horizon.source
  end

  test "monthly irradiation: horizontal plane, averaged over the database years" do
    stub = stub_pvgis_irradiation
    irradiation = Providers::Pvgis.build({}).monthly_irradiation(POINT)

    assert_requested(:get, %r{MRcalc}) { |request| request.uri.query_values["horirrad"] == "1" }
    assert_requested stub
    assert_equal 12, irradiation.monthly.size
    assert_equal 23.7, irradiation.monthly.first
    assert_equal 161.8, irradiation.monthly[5]
    assert_equal [ 2005, 2023, "PVGIS-SARAH3" ], [ irradiation.year_min, irradiation.year_max, irradiation.database ]
  end

  test "cached per point rounded to about 100 m" do
    stub = stub_pvgis_horizon
    pvgis = Providers::Pvgis.build({})
    with_memory_cache do
      pvgis.horizon(POINT)
      pvgis.horizon(Providers::Climate::Point.build(4.8801, 50.3199))
    end
    assert_requested stub, times: 1
  end

  test "off with PVGIS_PROVIDER=none: never calls the API" do
    pvgis = Providers::Pvgis.build({ "PVGIS_PROVIDER" => "none" })
    assert_not pvgis.available?
    error = assert_raises(Providers::Pvgis::Unavailable) { pvgis.horizon(POINT) }
    assert_equal :not_configured, error.reason
    assert_not_requested :any, /jrc\.ec\.europa\.eu/
  end

  test "PVGIS_URL points elsewhere" do
    stub = stub_request(:get, %r{\Ahttps://pvgis\.example\.org/api/printhorizon}).to_return(status: 200, body: file_fixture("sun/printhorizon.json").read)
    Providers::Pvgis.build({ "PVGIS_URL" => "https://pvgis.example.org/api/" }).horizon(POINT)
    assert_requested stub
  end

  test "the sea is out of coverage, a server error is an upstream error" do
    stub_pvgis_horizon(status: 400, body: { message: "Location over the sea. Please, select another location", status: 400 }.to_json)
    assert_equal :out_of_coverage, assert_raises(Providers::Pvgis::Unavailable) { Providers::Pvgis.build({}).horizon(POINT) }.reason

    stub_pvgis_irradiation(status: 529, body: "Site is overloaded")
    assert_equal :upstream_error, assert_raises(Providers::Pvgis::Unavailable) { Providers::Pvgis.build({}).monthly_irradiation(POINT) }.reason
  end

  test "a timeout or an unexpected answer is an upstream error, and is not cached" do
    stub_request(:get, %r{printhorizon}).to_timeout.then.to_return(status: 200, body: { outputs: {} }.to_json)
    pvgis = Providers::Pvgis.build({})
    with_memory_cache do
      assert_equal :upstream_error, assert_raises(Providers::Pvgis::Unavailable) { pvgis.horizon(POINT) }.reason
      assert_equal :upstream_error, assert_raises(Providers::Pvgis::Unavailable) { pvgis.horizon(POINT) }.reason
    end
    assert_requested :get, %r{printhorizon}, times: 2
  end
end
