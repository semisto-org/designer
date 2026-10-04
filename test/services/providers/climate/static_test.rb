require "test_helper"
require_relative "../../../test_helpers/climate_test_helper"

class Providers::Climate::StaticTest < ActiveSupport::TestCase
  include ClimateTestHelper

  setup { @provider = Providers::Climate::Static.new(seed_climate!) }

  test "current normals and hardiness zone by natural sub-area" do
    condroz = @provider.current_normals([ 4.9075, 50.341 ]) # Yvoir
    assert condroz.available?
    assert_equal "condroz_famenne", condroz.data[:sub_area][:key]
    assert_equal "7b", condroz.data[:zone][:code]
    assert_equal(-12.5, condroz.data[:normals][:extreme_min_c])
    assert_equal 178, condroz.data[:normals][:frost_free_days]
    assert_equal "indicative", condroz.data[:status]
    assert condroz.data[:sources].any? { _1[:key] == "irm_normals" }

    assert_equal "ardenne", @provider.current_normals([ 5.4, 50.0 ]).data[:sub_area][:key] # Saint-Hubert
    assert_equal "7a", @provider.current_normals([ 5.4, 50.0 ]).data[:zone][:code]
    assert_equal "limoneuse", @provider.current_normals([ 4.61, 50.67 ]).data[:sub_area][:key] # Wavre
    assert_equal "condroz_famenne", @provider.current_normals([ 5.6, 49.6 ]).data[:sub_area][:key] # Virton, Lorraine
  end

  test "points outside every outline fall back to the default sub-area" do
    assert_equal "limoneuse", @provider.current_normals(GeoJsonGeometry::FACTORY.point(3.4, 50.6)).data[:sub_area][:key]
  end

  test "projected zone shifts with the extreme minimum delta" do
    result = @provider.projection([ 4.9075, 50.341 ], horizon: 2050, scenario: "moderate")
    assert result.available?
    assert_equal(-10.5, result.data[:extreme_min_c])
    assert_equal "8a", result.data[:zone][:code]
    assert_equal "2041-2060", result.data[:period]
    assert_equal "RCP4.5 / SSP2-4.5", result.data[:ipcc]

    high = @provider.projection([ 4.9075, 50.341 ], horizon: "2080", scenario: :high)
    assert_equal(-7.5, high.data[:extreme_min_c])
    assert_equal "8b", high.data[:zone][:code]
    assert_equal %w[8a 9a], high.data[:zone_range]
    assert_equal [ -35.0, -20.0, -5.0 ], high.data[:deltas][:summer_precip_pct]
    assert_equal 13.0, high.data[:mean_temp_c]
  end

  test "rejects unknown horizons and scenarios" do
    assert_raises(ArgumentError) { @provider.projection([ 4.9, 50.3 ], horizon: 2100, scenario: "high") }
    assert_raises(ArgumentError) { @provider.projection([ 4.9, 50.3 ], horizon: 2050, scenario: "rcp26") }
  end

  test "no location, no data" do
    assert_equal :no_location, @provider.current_normals(nil).reason
    assert_equal :no_location, @provider.projection(nil, horizon: 2050, scenario: "high").reason
    blank = Providers::Climate::Static.new(Region.new(key: "elsewhere", settings: {}))
    assert_not blank.supports?(:normals)
    assert_equal :not_configured, blank.current_normals([ 4.9, 50.3 ]).reason
    assert_equal :not_supported, @provider.forecast([ 4.9, 50.3 ]).reason
  end

  test "caches results per location" do
    with_memory_cache do
      assert_equal "7b", @provider.current_normals([ 4.9075, 50.341 ]).data[:zone][:code]
      # Changed in memory only (same region version): the cached entry wins.
      @provider.send(:sub_areas).each { _1["normals"]["extreme_min_c"] = -30 }
      assert_equal "7b", @provider.current_normals([ 4.9076, 50.3411 ]).data[:zone][:code]
      assert_equal "4b", @provider.current_normals([ 4.95, 50.341 ]).data[:zone][:code], "another location is computed"
    end
  end
end
