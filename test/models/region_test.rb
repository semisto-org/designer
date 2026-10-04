require "test_helper"
require_relative "../support/regions_test_helper"

class RegionTest < ActiveSupport::TestCase
  include RegionsTestHelper

  setup { seed_regions }

  test "seeds a European base and three equipped regions inheriting from it" do
    europe = Region.europe
    assert europe.europe?
    assert_nil europe.outline
    assert_equal %w[france luxembourg wallonia], europe.children.pluck(:key).sort
    %w[wallonia france luxembourg].each do |key|
      assert region(key).outline.present?, "#{key} has an outline"
      assert_equal europe, region(key).parent
    end
  end

  test "a place belongs to the region whose outline covers it" do
    {
      [ 4.88, 50.33 ] => "wallonia",   # Yvoir
      [ 4.61, 50.72 ] => "wallonia",   # Wavre
      [ 5.82, 49.68 ] => "wallonia",   # Arlon
      [ 3.21, 50.74 ] => "wallonia",   # Mouscron
      [ 3.06, 50.63 ] => "france",     # Lille, inside Wallonia's old rectangle
      [ 9.0, 42.2 ] => "france",       # Corsica
      [ 6.13, 49.61 ] => "luxembourg", # Luxembourg City
      [ 4.35, 50.85 ] => "europe",     # Brussels
      [ 13.4, 52.5 ] => "europe"       # Berlin
    }.each do |(lng, lat), key|
      assert_equal key, Region.for_point(lng, lat).key, "#{lng}, #{lat}"
    end
  end

  test "a place just outside a coarse outline still joins the nearest region" do
    # 500 m off the French Atlantic coast near Biarritz.
    assert_equal "france", Region.for_point(-1.575, 43.48).key
  end

  test "an invalid place falls back to Europe" do
    assert_equal "europe", Region.for_point("abc", nil).key
  end

  test "inactive regions are skipped" do
    region("france").update!(active: false)
    assert_equal "europe", Region.for_point(3.06, 50.63).key
  end

  test "a top-level setting comes whole from the region, else from its parent" do
    assert_equal "arcgis_elevation", region("wallonia").setting(:relief, :provider)
    assert_equal "copernicus_dem", region("luxembourg").setting(:relief, :provider)
    assert_equal 850, region("wallonia").setting(:hydrology, :annual_rainfall_mm)
    assert_nil region("france").setting(:hydrology, :annual_rainfall_mm), "no continental rainfall figure"
    assert_equal 0.8, region("france").setting(:hydrology, :roof_coefficient)
    assert_nil region("france").setting(:relief, :datasets, :surface), "France's relief does not mix with Europe's"
  end

  test "the catalogue keeps the parent's layers a region does not replace" do
    france = region("france").catalogue.enabled
    assert_equal "france", france.find_by!(key: "natura2000").region.key, "France replaces Natura 2000"
    assert_equal "europe", france.find_by!(key: "plan").region.key, "and inherits the neutral plan"
    assert_equal [ "ortho" ], france.select(&:default?).map(&:key)
    assert_equal 1, france.where(key: "natura2000").count

    wallonia = region("wallonia").catalogue.enabled
    assert_equal "wallonia", wallonia.find_by!(key: "plan").region.key
    assert wallonia.exists?(key: "sol_ph")
    assert_equal wallonia.map(&:key).uniq.size, wallonia.size, "one layer per key"

    europe = Region.europe.catalogue
    assert_equal %w[corine natura2000 plan sol_argile sol_ph], europe.map(&:key).sort
  end

  test "the seeds are idempotent" do
    stamp = RegionLayer.maximum(:updated_at)
    travel 1.minute do
      seed_regions
      assert_equal stamp, RegionLayer.maximum(:updated_at), "an unchanged seed does not bust the tile cache"
    end
  end

  test "every new layer goes through an allowed relay host" do
    %w[europe france luxembourg].each do |key|
      region(key).layers.where(proxied: true).find_each do |layer|
        assert Providers::GeoHttp.allowed?(layer.url), "#{key}/#{layer.key}: #{layer.url}"
      end
    end
  end

  test "a region cannot be its own parent" do
    france = region("france")
    france.parent = france
    assert_not france.valid?
  end
end
