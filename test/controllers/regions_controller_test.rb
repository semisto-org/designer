require "test_helper"
require_relative "../support/regions_test_helper"

class RegionsControllerTest < ActionDispatch::IntegrationTest
  include RegionsTestHelper

  setup { seed_regions }

  test "locates a place and answers its region with its base maps" do
    sign_in_as users(:michael)
    get locate_region_path, params: { lng: 3.06, lat: 50.63 }, as: :json
    assert_response :success
    assert_equal "france", response.parsed_body.dig("region", "key")
    assert_equal %w[ortho plan plan_ign], response.parsed_body["layers"].map { _1["key"] }.sort
  end

  test "outside every region: the European base" do
    sign_in_as users(:michael)
    get locate_region_path, params: { lng: 13.4, lat: 52.5 }, as: :json
    assert_equal "europe", response.parsed_body.dig("region", "key")
  end

  test "an invalid place is refused" do
    sign_in_as users(:michael)
    get locate_region_path, params: { lng: "nord" }, as: :json
    assert_response :unprocessable_entity
  end

  test "requires sign in" do
    get locate_region_path, params: { lng: 3.06, lat: 50.63 }
    assert_redirected_to new_session_path
  end
end
