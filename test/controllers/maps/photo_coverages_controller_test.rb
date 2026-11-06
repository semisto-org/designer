require "test_helper"
require "test_helpers/photo_archive_test_helper"

class Maps::PhotoCoveragesControllerTest < ActionDispatch::IntegrationTest
  include PhotoArchiveTestHelper

  setup do
    @map = maps(:ahinvaux)
    seed_wallonia_photos
  end

  test "requires a role on the map" do
    sign_in_as users(:bob)
    get map_photo_coverage_path(@map), as: :json
    assert_response :not_found
  end

  test "a viewer learns which partial flights miss the map" do
    stub_photo("ORTHO_2022_ETE", jpeg([ 255, 255, 255 ]))
    sign_in_as users(:alice)
    get map_photo_coverage_path(@map), as: :json
    assert_response :success
    assert_equal({ "uncovered" => %w[ortho_2022_ete ortho_2022_ete_ir] }, response.parsed_body)
  end
end
