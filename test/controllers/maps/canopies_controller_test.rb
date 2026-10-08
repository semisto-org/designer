require "test_helper"
require_relative "../../test_helpers/canopy_test_helper"

class Maps::CanopiesControllerTest < ActionDispatch::IntegrationTest
  include CanopyTestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  test "requires sign in and a role on the map" do
    get map_canopy_path(@map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_canopy_path(@map), as: :json
    assert_response :not_found
  end

  test "viewers read the canopy report from Meta's bucket" do
    stub_request(:get, %r{dataforgood-fb-data\.s3\.amazonaws\.com/forests/v2/global/dinov3_global_chm_v2_ml3/chm/\d+\.tif}).to_return(status: 404)
    stub_request(:get, %r{dataforgood-fb-data\.s3\.amazonaws\.com/.*/metadata/}).to_return(status: 404)
    sign_in_as users(:alice)
    get map_canopy_path(@map), as: :json
    assert_response :success
    assert_equal({ "available" => false, "reason" => "no_coverage" }, response.parsed_body)
  end

  test "the full report, camelCase" do
    gx, gy = global_pixel(4.9075, 50.341)
    fx, fy = gx / PX, gy / PX
    quadkey = Providers::CanopyHeight.quadkey(fx, fy)
    tiles = (-2..2).flat_map { |dy| (-2..2).map { |dx| [ [ (gx % PX) / 512 + dx, (gy % PX) / 512 + dy ], 15 ] } }.to_h
    url = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3"
    stub_ranged("#{url}/chm/#{quadkey}.tif", canopy_tiff(fx, fy, tiles))
    stub_request(:get, "#{url}/metadata/#{quadkey}.geojson").to_return(status: 200, body: file_fixture("canopy/metadata_1202023103.geojson").read)

    sign_in_as users(:michael)
    get map_canopy_path(@map), as: :json
    json = response.parsed_body
    assert json["available"]
    assert_equal %w[width height cellM bounds data], json["grid"].keys
    assert_equal 15, json["stats"]["maxHeightM"]
    assert_equal 1.0, json["stats"]["canopyShare"]
    assert_equal({ "canopyM" => 3, "tallM" => 10 }, json["thresholds"])
    assert_equal "2018-09-27", json["imagery"]["from"]
  end

  test "unavailable when switched off" do
    sign_in_as users(:michael)
    with_env("CANOPY_HEIGHT_PROVIDER" => "none") { get map_canopy_path(@map), as: :json }
    assert_equal({ "available" => false, "reason" => "not_configured" }, response.parsed_body)
  end

  private
    def with_env(values)
      previous = values.keys.index_with { ENV[_1] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      previous.each { |key, value| ENV[key] = value }
    end
end
