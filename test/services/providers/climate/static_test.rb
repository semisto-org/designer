require "test_helper"
require_relative "../../../test_helpers/climate_test_helper"

class Providers::Climate::StaticTest < ActiveSupport::TestCase
  include ClimateTestHelper

  setup { @provider = Providers::Climate::Static.new(seed_climate!) }

  test "current normals and hardiness zone by natural sub-area" do
    condroz = @provider.current_normals([ 4.9075, 50.341 ]) # Yvoir
    assert condroz.available?
    assert_equal "condroz_famenne", condroz.data[:sub_area][:key]
    assert_equal "8a", condroz.data[:zone][:code]
    assert_equal(-10.0, condroz.data[:normals][:extreme_min_c])
    assert_equal 186, condroz.data[:normals][:frost_free_days]
    assert_equal "indicative", condroz.data[:status]
    assert condroz.data[:sources].any? { _1[:key] == "irm_climate_city" }
    assert_includes condroz.data[:stations].map { _1[:name] }, "Yvoir (commune)"
    reference = condroz.data[:references][:extreme_min_c]
    assert_equal [ "irm_opendata_synop" ], reference[:sources].map { _1[:key] }
    assert_includes reference[:detail], "Florennes -10,0"

    assert_equal "ardenne", @provider.current_normals([ 5.4, 50.0 ]).data[:sub_area][:key] # Saint-Hubert
    assert_equal "7b", @provider.current_normals([ 5.4, 50.0 ]).data[:zone][:code]
    assert_equal "limoneuse", @provider.current_normals([ 4.61, 50.67 ]).data[:sub_area][:key] # Wavre
    assert_equal "lorraine", @provider.current_normals([ 5.53, 49.57 ]).data[:sub_area][:key] # Virton
    assert_equal "lorraine", @provider.current_normals([ 5.82, 49.68 ]).data[:sub_area][:key] # Arlon
  end

  test "points outside every outline fall back to the default sub-area" do
    assert_equal "limoneuse", @provider.current_normals(GeoJsonGeometry::FACTORY.point(3.4, 50.6)).data[:sub_area][:key]
  end

  test "projected zone shifts with the extreme minimum delta" do
    result = @provider.projection([ 4.9075, 50.341 ], horizon: 2050, scenario: "moderate")
    assert result.available?
    assert_equal(-7.5, result.data[:extreme_min_c])
    assert_equal "8b", result.data[:zone][:code]
    assert_equal "2041-2060", result.data[:period]
    assert_equal "RCP4.5 / SSP2-4.5", result.data[:ipcc]

    high = @provider.projection([ 4.9075, 50.341 ], horizon: "2080", scenario: :high)
    assert_equal(-4.0, high.data[:extreme_min_c])
    assert_equal "9a", high.data[:zone][:code]
    assert_equal %w[9a 10a], high.data[:zone_range]
    assert_equal [ -40.0, -22.0, 0.0 ], high.data[:deltas][:summer_precip_pct]
    assert_equal 13.7, high.data[:mean_temp_c]
    assert_includes high.data[:references][:summer_precip_pct], "CORDEX.be"
    assert_equal %i[mean_temp_c extreme_min_c summer_temp_c summer_precip_pct winter_precip_pct].sort, high.data[:references].keys.sort
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
      assert_equal "8a", @provider.current_normals([ 4.9075, 50.341 ]).data[:zone][:code]
      # Changed in memory only (same region version): the cached entry wins.
      @provider.send(:sub_areas).each { _1["normals"]["extreme_min_c"] = -30 }
      assert_equal "8a", @provider.current_normals([ 4.9076, 50.3411 ]).data[:zone][:code]
      assert_equal "4b", @provider.current_normals([ 4.95, 50.341 ]).data[:zone][:code], "another location is computed"
    end
  end
end
