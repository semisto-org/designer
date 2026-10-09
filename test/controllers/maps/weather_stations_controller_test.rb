require "test_helper"
require_relative "../../test_helpers/weather_stations_test_helper"

class Maps::WeatherStationsControllerTest < ActionDispatch::IntegrationTest
  include WeatherStationsTestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  test "requires sign in and a role on the map" do
    get map_weather_stations_path(@map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_weather_stations_path(@map), as: :json
    assert_response :not_found
  end

  test "not configured for the region: a quiet answer, no call" do
    sign_in_as users(:alice)
    get map_weather_stations_path(@map), as: :json
    assert_response :success
    assert_equal({ "available" => false, "reason" => "not_configured" }, response.parsed_body)
    assert_not_requested :any, /meteo\.be/
  end

  test "viewers read the nearest stations and their last days" do
    use_irm!
    stub_irm_stations
    stub_irm_daily
    sign_in_as users(:alice)
    get map_weather_stations_path(@map), as: :json
    assert_response :success
    json = response.parsed_body
    assert json["available"]
    assert_equal "Florennes", json["stations"].first["name"]
    assert json["observed"]["available"]
  end

  test "a station chosen on the map" do
    use_irm!
    stub_irm_stations
    stub_irm_daily
    sign_in_as users(:michael)
    get map_weather_stations_path(@map, station: 6459), as: :json
    assert_equal "Ernage", response.parsed_body["observed"]["station"]["name"]
  end

  test "every station as GeoJSON" do
    use_irm!
    stub_irm_stations
    sign_in_as users(:michael)
    get stations_map_weather_stations_path(@map), as: :json
    assert_response :success
    json = response.parsed_body
    assert_equal "FeatureCollection", json["type"]
    assert_equal 29, json["features"].size
  end
end
