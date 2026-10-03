require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class Relief::TerrainImportTest < ActiveSupport::TestCase
  include ReliefTestHelper

  setup do
    configure_relief_region
    @map = small_map
    @terrain = @map.create_terrain!
  end

  test "imports terrain, surface, land cover and ortho into Active Storage" do
    stub_spw
    Relief::TerrainImport.new(@terrain, provider: instant_provider).call
    @terrain.reload

    assert_equal "ready", @terrain.status, @terrain.error
    assert_equal 100, @terrain.progress
    assert_equal 1.0, @terrain.cell_size_m
    assert_equal "EPSG:3857", @terrain.crs
    assert_in_delta 26, @terrain.cols, 3
    assert_in_delta 36, @terrain.rows, 3
    assert @terrain.grid.attached?
    assert_equal @terrain.cols * @terrain.rows * 2, @terrain.grid.blob.byte_size
    assert_equal @terrain.cols * @terrain.rows, @terrain.landcover.blob.byte_size
    assert_equal ReliefTestHelper::JPEG, @terrain.texture.download
    assert_not_nil @terrain.fetched_at
    assert_in_delta 200, @terrain.z_min, 3

    meta = @terrain.metadata
    assert_equal "MNT de test", meta.dig("sources", "terrain")
    assert_equal "© SPW (test)", meta["attribution"]
    assert_in_delta 202, meta.dig("surface", "z_min"), 3
    assert meta.dig("landcover", "counts").key?("7")
    assert_empty meta["warnings"]

    # The plane rises 10 cm per metre: the boundary's slope and drop.
    stats = @terrain.stats
    assert_in_delta 10.0, stats["slope_mean_pct"], 0.5
    assert_in_delta 2.7, stats["drop"], 0.4

    heights = Relief::Raster.unpack_heights(@terrain.grid.download, z_min: @terrain.z_min)
    assert_operator heights.first, :>, heights.last, "rows run from north (high) to south (low)"
  end

  test "an optional layer that fails leaves a warning, not a failure" do
    stub_spw(surface: false, texture: false)
    stub_request(:post, "#{ReliefTestHelper::MNS}/identify").to_return(status: 500)
    stub_request(:get, %r{#{Regexp.escape(ReliefTestHelper::ORTHO)}/export}).to_return(status: 404)
    Relief::TerrainImport.new(@terrain, provider: instant_provider).call

    assert_equal "ready", @terrain.reload.status
    assert_not @terrain.surface.attached?
    assert_not @terrain.texture.attached?
    assert @terrain.landcover.attached?
    assert_equal 2, @terrain.metadata["warnings"].size
    assert_match(/surface/, @terrain.metadata["warnings"].first)
  end

  test "a terrain model that fails fails the import with a French message" do
    stub_request(:post, "#{ReliefTestHelper::MNT}/identify").to_return(status: 500)
    Relief::TerrainImport.new(@terrain, provider: instant_provider).call

    assert_equal "failed", @terrain.reload.status
    assert_equal I18n.t("relief.errors.provider_failed"), @terrain.error
    assert_not @terrain.grid.attached?
  end

  test "refuses a region without provider and a map without boundary" do
    elsewhere = Region.create!(key: "luxembourg", name: "Luxembourg", country_code: "LU")
    @map.update!(region: elsewhere)
    Relief::TerrainImport.new(@terrain.reload).call
    assert_equal I18n.t("relief.errors.unavailable"), @terrain.reload.error
    @map.update!(region: regions(:wallonia))

    @map.update_columns(boundary: nil)
    Relief::TerrainImport.new(@terrain.reload, provider: instant_provider).call
    assert_equal I18n.t("relief.errors.no_boundary"), @terrain.reload.error
  end

  test "refuses a terrain too large" do
    @map.update!(boundary: square(lng: 4.8, lat: 50.2, size: 0.4))
    Relief::TerrainImport.new(@terrain, provider: instant_provider).call
    assert_equal "failed", @terrain.reload.status
    assert_match(/trop étendu/, @terrain.error)
  end

  test "the job runs the import" do
    stub_spw
    configure_relief_region
    ReliefImportJob.perform_now(@terrain)
    assert_equal "ready", @terrain.reload.status
  end
end
