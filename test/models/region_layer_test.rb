require "test_helper"
require_relative "../support/map_data_test_helper"

class RegionLayerTest < ActiveSupport::TestCase
  include MapDataTestHelper

  test "the Wallonia seed is complete and idempotent" do
    layers = seed_wallonia_layers
    assert_equal 53, layers.size
    assert_equal 38, layers.count(&:photo?), "21 flights from 1971, 17 of them with an infrared twin"
    assert_equal %w[plan], layers.select(&:base?).reject(&:photo?).map(&:key)
    assert_equal 14, layers.count(&:identifiable?)
    assert_equal [ "ortho_2026" ], layers.select(&:default?).map(&:key)
    assert_equal [ "cadastre" ], layers.select { |l| l.role == "cadastre" }.map(&:key)
    assert layers.select { |l| l.url.include?("wallonie") }.all? { |l| l.attribution == "© SPW – Géoportail de la Wallonie" }
    stacked = layers.reject(&:infrared?) # a twin shares its photo's place
    assert_equal stacked.map(&:position).uniq.size, stacked.size, "unique stacking order"

    stamp = layers.maximum(:updated_at)
    travel 1.minute do
      assert_equal 53, seed_wallonia_layers.size
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

  test "the cadastre asks HiDPI tiles so its parcel numbers stay sharp" do
    seed_wallonia_layers
    cadastre = wallonia_layer("cadastre")
    assert_equal 2, cadastre.pixel_ratio
    assert_equal 512, cadastre.tile_size
    url = cadastre.upstream_tile_url(18, 134_000, 88_000)
    assert_includes url, "WIDTH=1024"
    assert_includes url, "HEIGHT=1024"
    assert_includes url, "DPI=192"

    sols = wallonia_layer("sols")
    assert_equal 1, sols.pixel_ratio
    assert_includes sols.upstream_tile_url(18, 134_000, 88_000), "WIDTH=512"
    assert_not_includes sols.upstream_tile_url(18, 134_000, 88_000), "DPI="

    cadastre.update!(kind: "arcgis_rest")
    assert_includes cadastre.upstream_tile_url(18, 134_000, 88_000), "dpi=192"
    assert_includes cadastre.upstream_tile_url(18, 134_000, 88_000), "size=1024%2C1024"
    # A one-off image keeps the size and DPI it is asked for.
    assert_not_includes cadastre.upstream_image_url([ 0, 0, 1, 1 ], width: 800, height: 600), "dpi="
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
