require "test_helper"
require_relative "../../test_helpers/climate_test_helper"

class Maps::ClimatesControllerTest < ActionDispatch::IntegrationTest
  include ClimateTestHelper

  setup do
    seed_climate!
    @map = maps(:ahinvaux)
  end

  test "requires sign in and a role on the map" do
    get map_climate_path(@map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_climate_path(@map), as: :json
    assert_response :not_found
  end

  test "viewers read the climate report (beta: everything unlocked)" do
    sign_in_as users(:alice)
    get map_climate_path(@map), as: :json
    assert_response :success
    json = response.parsed_body
    assert json["entitled"]
    assert_equal "7b", json["current"]["zone"]["code"]
    assert json["projections"]["available"]
    assert_equal({ "normals" => true, "projections" => true, "forecast" => false }, json["capabilities"])
  end

  test "with billing on, a free owner gets the current zone only" do
    sign_in_as users(:michael)
    with_billing { get map_climate_path(@map), as: :json }
    json = response.parsed_body
    assert_not json["entitled"]
    assert_equal "7b", json["current"]["zone"]["code"]
    assert json["projections"]["locked"]
    assert json["plants"]["locked"]
  end

  test "forecast: unavailable without a commercial key, never calls the free API" do
    sign_in_as users(:michael)
    get forecast_map_climate_path(@map), as: :json
    assert_response :success
    assert_equal({ "available" => false, "reason" => "not_configured", "supported" => false }, response.parsed_body)
    assert_not_requested :any, /open-meteo\.com/
  end

  test "forecast through the commercial API when the key is set" do
    stub_request(:get, %r{customer-api\.open-meteo\.com/v1/forecast})
      .to_return(status: 200, body: file_fixture("open_meteo/forecast.json").read, headers: { "Content-Type" => "application/json" })
    sign_in_as users(:michael)
    previous = ENV["OPEN_METEO_API_KEY"]
    ENV["OPEN_METEO_API_KEY"] = "secret"
    get forecast_map_climate_path(@map), as: :json
    assert_response :success
    assert_equal 7, response.parsed_body["days"].size
  ensure
    ENV["OPEN_METEO_API_KEY"] = previous
  end
end
