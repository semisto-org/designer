require "test_helper"

class Maps::BoundaryImportsControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "an editor imports a KML outline" do
    sign_in_as users(:michael)
    post map_boundary_import_path(@map), params: { file: fixture_file_upload("terrain.kml", "application/vnd.google-earth.kml+xml") }
    assert_response :success
    assert_equal "MultiPolygon", response.parsed_body.dig("map", "boundary", "type")
  end

  test "errors are explained" do
    sign_in_as users(:michael)
    post map_boundary_import_path(@map), params: {}
    assert_response :unprocessable_entity
    assert_equal I18n.t("map_data.import.errors.missing"), response.parsed_body["message"]
  end

  test "viewers cannot import" do
    sign_in_as users(:alice)
    post map_boundary_import_path(@map), params: { file: fixture_file_upload("terrain.kml") }, as: :json
    assert_response :forbidden
  end
end
