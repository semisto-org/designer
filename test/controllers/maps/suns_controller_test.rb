require "test_helper"
require_relative "../../test_helpers/sun_test_helper"

class Maps::SunsControllerTest < ActionDispatch::IntegrationTest
  include SunTestHelper

  setup { @map = maps(:ahinvaux) }

  test "requires sign in and a role on the map" do
    get map_sun_path(@map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_sun_path(@map), as: :json
    assert_response :not_found
  end

  test "viewers read the sun report" do
    stub_pvgis
    sign_in_as users(:alice)
    get map_sun_path(@map), as: :json
    assert_response :success
    json = response.parsed_body
    assert json["horizon"]["available"]
    assert_equal 12, json["months"].size
    assert_equal 3, json["paths"].size
  end

  test "PVGIS down: still answers, with the sun paths" do
    stub_request(:get, /jrc\.ec\.europa\.eu/).to_timeout
    sign_in_as users(:michael)
    get map_sun_path(@map), as: :json
    assert_response :success
    assert_equal "upstream_error", response.parsed_body["horizon"]["reason"]
    assert_equal 3, response.parsed_body["paths"].size
  end
end
