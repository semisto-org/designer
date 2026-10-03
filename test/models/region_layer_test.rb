require "test_helper"
require_relative "../support/map_data_test_helper"

class RegionLayerTest < ActiveSupport::TestCase
  include MapDataTestHelper

  test "the Wallonia seed is complete and idempotent" do
    layers = seed_wallonia_layers
    assert_equal 14, layers.size
    assert_equal %w[ortho_1971 ortho_1994 ortho_2026 plan], layers.select(&:base?).map(&:key).sort
    assert_equal 10, layers.count(&:identifiable?)
    assert_equal [ "ortho_2026" ], layers.select(&:default?).map(&:key)
    assert_equal [ "cadastre" ], layers.select { |l| l.role == "cadastre" }.map(&:key)
    assert layers.select { |l| l.url.include?("wallonie") }.all? { |l| l.attribution == "© SPW – Géoportail de la Wallonie" }
    assert_equal layers.map(&:position).uniq.size, layers.size, "unique stacking order"

    stamp = layers.maximum(:updated_at)
    travel 1.minute do
      assert_equal 14, seed_wallonia_layers.size
      assert_equal stamp, layers.reload.maximum(:updated_at), "an unchanged seed does not bust the tile cache"
    end
  end

  test "locked layers keep their manual edits" do
    seed_wallonia_layers
    layer = wallonia_layer("sols")
    layer.update!(name: "Sols (édité)", options: layer.options.merge("locked" => true))
    seed_wallonia_layers
    assert_equal "Sols (édité)", layer.reload.name
  end

  test "tile URLs: relay for proxied layers, direct WMS template otherwise, style as is" do
    seed_wallonia_layers
    sols = wallonia_layer("sols")
    assert_equal "/regions/#{sols.region_id}/layers/sols/tiles/{z}/{x}/{y}?v=#{sols.cache_version}", sols.tile_url
    sols.update!(proxied: false)
    assert sols.tile_url.start_with?("https://geoservices.wallonie.be/arcgis/services/SOL_SOUS_SOL/CNSW/MapServer/WMSServer?")
    assert sols.tile_url.end_with?("&BBOX={bbox-epsg-3857}")
    assert_equal "https://tiles.openfreemap.org/styles/positron", wallonia_layer("plan").tile_url
  end

  test "identify settings and inertia payload" do
    seed_wallonia_layers
    courbes = wallonia_layer("courbes")
    assert_equal "0", courbes.identify_layers
    assert_equal 0, courbes.identify_tolerance
    assert_equal "courbes", courbes.identify_formatter
    payload = courbes.as_inertia
    assert_equal 512, payload[:tileSize]
    assert payload[:description].present?
    assert_nil payload[:url], "proxied layers do not leak their upstream"
  end

  test "validations" do
    layer = regions(:wallonia).layers.new(key: "Bad Key", name: "x", url: "https://x", kind: "style", proxied: true)
    assert_not layer.valid?
    assert layer.errors[:key].any?
    assert layer.errors[:proxied].any?
  end
end
