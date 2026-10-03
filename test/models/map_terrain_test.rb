require "test_helper"
require_relative "../test_helpers/relief_test_helper"

class MapTerrainTest < ActiveSupport::TestCase
  include ReliefTestHelper

  test "an import in progress goes stale when it stops talking" do
    terrain = maps(:ahinvaux).create_terrain!(status: "running")
    assert terrain.in_progress?
    terrain.update_columns(updated_at: 1.hour.ago)
    assert_not terrain.reload.in_progress?
    terrain.update!(status: "ready")
    assert_not terrain.in_progress?
  end

  test "validates its status and is destroyed with its map" do
    map = maps(:ahinvaux)
    assert_not map.build_terrain(status: "lost").valid?
    map.create_terrain!
    assert_difference -> { MapTerrain.count }, -1 do
      map.destroy
    end
  end

  test "summary exposes state and camelized stats" do
    terrain = maps(:ahinvaux).create_terrain!(status: "ready", cell_size_m: 1, metadata: { "stats" => { "slope_mean_pct" => 7.2 } })
    summary = terrain.as_summary
    assert_equal "ready", summary[:status]
    assert_equal 7.2, summary[:stats]["slopeMeanPct"]
    assert_equal({ surface: false, landcover: false, texture: false }, summary[:layers])
    assert_nil terrain.file("grid")
    assert_nil terrain.file("../secrets")
  end

  test "water settings: region defaults, map overrides, soil factors" do
    configure_relief_region
    map = maps(:ahinvaux)
    settings = map.effective_water_settings
    assert_equal 850, settings["annual_rainfall_mm"]
    assert_equal 1.0, settings["rate_factor"]
    map.update!(water_settings: { soil: "clay", annual_rainfall_mm: "920", unknown: "x" })
    settings = map.reload.effective_water_settings
    assert_equal 920.0, settings["annual_rainfall_mm"]
    assert_equal 0.4, settings["rate_factor"]
    assert_equal 1.2, settings["storage_factor"]
    assert_not map.water_settings.key?("unknown")
  end

  test "a region without hydrology defaults asks for the rainfall" do
    region = Region.create!(key: "lux", name: "Luxembourg", country_code: "LU")
    map = Map.create!(name: "Jardin", owner: users(:bob), region:)
    assert_nil map.effective_water_settings["annual_rainfall_mm"]
    assert_equal 0.8, map.effective_water_settings["roof_coefficient"]
    assert_nil Relief::Rainwater.new(map).call[:volumeM3]
  end
end
