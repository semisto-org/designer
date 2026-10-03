require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class Maps::ReliefControllersTest < ActionDispatch::IntegrationTest
  include ReliefTestHelper
  include ActiveJob::TestHelper

  setup do
    configure_relief_region
    @map = small_map
    @map.memberships.create!(user: users(:alice), role: "viewer")
  end

  test "panel overview: provider, grid preview, settings with region defaults, rainwater" do
    @map.features.create!(layer: "existing", kind: "building", name: "Maison", geometry: square(lng: 4.9001, lat: 50.3401, size: 0.0001))
    sign_in_as users(:michael)
    get map_terrain_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert body["available"]
    assert_equal "SPW de test", body["providerLabel"]
    assert_equal 1.0, body.dig("grid", "cellSizeM")
    assert_nil body["terrain"]
    assert_equal 850, body.dig("settings", "annualRainfallMm")
    assert_equal %w[clay loam], body["soils"]
    rain = body["rainwater"]
    assert_equal 1, rain["buildings"]
    # ~7.1 m × 11.1 m of roof × 0.85 m × 0.8
    assert_in_delta 79, rain["roofAreaM2"], 3
    assert_in_delta rain["roofAreaM2"] * 0.85 * 0.8, rain["volumeM3"], 0.1
  end

  test "an editor launches the import, which runs in the background" do
    sign_in_as users(:michael)
    assert_enqueued_with(job: ReliefImportJob) do
      post map_terrain_path(@map), as: :json
    end
    assert_response :accepted
    assert_equal "pending", response.parsed_body.dig("terrain", "status")

    post map_terrain_path(@map), as: :json
    assert_response :conflict
    assert_equal I18n.t("relief.errors.already_running"), response.parsed_body["message"]
  end

  test "a stale import can be relaunched" do
    sign_in_as users(:michael)
    @map.create_terrain!(status: "running").update_columns(updated_at: 2.hours.ago)
    post map_terrain_path(@map), as: :json
    assert_response :accepted
  end

  test "a viewer reads the overview but cannot launch the import" do
    sign_in_as users(:alice)
    get map_terrain_path(@map), as: :json
    assert_response :success
    post map_terrain_path(@map), as: :json
    assert_response :forbidden
  end

  test "regions without elevation provider say so" do
    @map.update!(region: Region.create!(key: "netherlands", name: "Pays-Bas", country_code: "NL"))
    sign_in_as users(:michael)
    get map_terrain_path(@map), as: :json
    assert_not response.parsed_body["available"]
    post map_terrain_path(@map), as: :json
    assert_response :unprocessable_entity
    assert_equal I18n.t("relief.errors.unavailable"), response.parsed_body["message"]
  end

  test "a map without boundary cannot import" do
    @map.update_columns(boundary: nil)
    sign_in_as users(:michael)
    post map_terrain_path(@map), as: :json
    assert_response :unprocessable_entity
    assert_equal I18n.t("relief.errors.no_boundary"), response.parsed_body["message"]
  end

  test "a terrain too large is refused before queuing" do
    @map.update!(boundary: square(lng: 4.8, lat: 50.2, size: 0.4))
    sign_in_as users(:michael)
    assert_no_enqueued_jobs do
      post map_terrain_path(@map), as: :json
    end
    assert_response :unprocessable_entity
    assert_match(/trop étendu/, response.parsed_body["message"])
  end

  test "analyses are gated by the owner's plan when billing is on" do
    with_billing do
      sign_in_as users(:michael)
      get map_terrain_path(@map), as: :json
      assert_response :payment_required
      assert response.parsed_body["upsell"]
      post map_terrain_path(@map), as: :json
      assert_response :payment_required
      patch map_water_settings_path(@map), params: { water_settings: { annual_rainfall_mm: 900 } }, as: :json
      assert_response :payment_required
      get map_relief_path(@map)
      assert_redirected_to map_path(@map)
    end
  end

  test "the relief page without terrain" do
    sign_in_as users(:alice)
    get map_relief_path(@map), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/reliefs/show", page["component"]
    assert_nil page.dig("props", "terrain")
    assert_equal "Europe/Brussels", page.dig("props", "timezone")
    assert_in_delta 4.9001, page.dig("props", "location", 0), 0.0001
  end

  test "the relief page and its files once imported" do
    stub_spw
    terrain = @map.create_terrain!
    Relief::TerrainImport.new(terrain, provider: instant_provider).call
    sign_in_as users(:alice)

    get map_relief_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    grid = props["terrain"]
    assert_equal terrain.reload.cols, grid["cols"]
    assert_equal 1.0, grid["cellSizeM"]
    assert_equal 0.01, grid["zUnit"]
    assert grid["landcover"]
    assert_equal 202, grid.dig("surface", "zMin").round
    assert_match %r{/maps/#{@map.id}/relief/files/grid\?v=}, grid.dig("files", "grid")
    assert_equal "Petit jardin", props.dig("map", "name")

    get grid.dig("files", "grid")
    assert_response :success
    assert_equal "application/octet-stream", response.media_type
    assert_equal terrain.cols * terrain.rows * 2, response.body.bytesize
    assert_match(/immutable/, response.headers["Cache-Control"])

    get grid.dig("files", "texture")
    assert_equal "image/jpeg", response.media_type

    get file_map_relief_path(@map, "grid")
    assert_response :success
  end

  test "files are private to the map's members" do
    sign_in_as users(:bob)
    get file_map_relief_path(@map, "grid")
    assert_response :not_found
    get map_terrain_path(@map), as: :json
    assert_response :not_found
  end

  test "water settings: editors save them, invalid values are refused" do
    sign_in_as users(:michael)
    patch map_water_settings_path(@map), params: { water_settings: { annual_rainfall_mm: 1100, soil: "clay", roof_coefficient: "" } }, as: :json
    assert_response :success
    assert_equal 1100, response.parsed_body.dig("settings", "annualRainfallMm")
    assert_equal "clay", response.parsed_body.dig("settings", "soil")
    assert_equal 0.8, response.parsed_body.dig("settings", "roofCoefficient")
    assert_equal({ "annual_rainfall_mm" => 1100.0, "soil" => "clay" }, @map.reload.water_settings)

    patch map_water_settings_path(@map), params: { water_settings: { annual_rainfall_mm: 20_000 } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Pluie annuelle/, response.parsed_body["message"])

    patch map_water_settings_path(@map), params: { water_settings: { soil: "lava" } }, as: :json
    assert_response :unprocessable_entity

    sign_in_as users(:alice)
    patch map_water_settings_path(@map), params: { water_settings: { annual_rainfall_mm: 900 } }, as: :json
    assert_response :forbidden
  end

  private
    def with_billing
      previous = ENV["STRIPE_SECRET_KEY"]
      ENV["STRIPE_SECRET_KEY"] = "sk_test_relief"
      yield
    ensure
      ENV["STRIPE_SECRET_KEY"] = previous
    end
end
