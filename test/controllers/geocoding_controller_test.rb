require "test_helper"
require_relative "../support/map_data_test_helper"

class GeocodingControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  test "searches addresses in the region" do
    stub_request(:get, %r{nominatim\.openstreetmap\.org/search}).to_return(json_response("nominatim_search.json"))
    sign_in_as users(:michael)
    get geocode_path, params: { q: "Rue du Bois 3 Yvoir", region_id: regions(:wallonia).id }, as: :json
    assert_response :success
    assert response.parsed_body["available"]
    first = response.parsed_body["results"].first
    assert_equal "Rue du Bois 3, 5530 Yvoir", first["label"]
    assert_equal 18, first["zoom"]
  end

  test "upstream down: 503 with a French message" do
    stub_request(:get, %r{nominatim}).to_return(status: 503)
    sign_in_as users(:michael)
    get geocode_path, params: { q: "Yvoir" }, as: :json
    assert_response :service_unavailable
    assert_equal I18n.t("map_data.geocode.unavailable"), response.parsed_body["message"]
  end

  test "switched off" do
    ENV["GEOCODER_PROVIDER"] = "none"
    sign_in_as users(:michael)
    get geocode_path, params: { q: "Yvoir" }, as: :json
    assert_response :success
    assert_equal false, response.parsed_body["available"]
  ensure
    ENV.delete("GEOCODER_PROVIDER")
  end

  test "requires sign in" do
    get geocode_path, params: { q: "Yvoir" }
    assert_redirected_to new_session_path
  end
end
