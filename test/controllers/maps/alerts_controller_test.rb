require "test_helper"

class Maps::AlertsControllerTest < ActionDispatch::IntegrationTest
  test "members read the regulatory alerts of the map's region" do
    load Rails.root.join("db/seeds/50_regulatory_rules.rb")
    sign_in_as users(:alice)
    get map_alerts_path(maps(:ahinvaux)), as: :json
    assert_response :success

    body = response.parsed_body
    assert_equal 10, body["rulesCount"]
    assert body["boundary"]
    alert = body["alerts"].sole # the fixture pond is about 310 m²
    assert_equal "pond_max_area_absolute", alert["rule"]
    assert_equal [ map_features(:pond).id ], alert["featureIds"]
    assert_equal "warning", alert["severity"]
    assert_match(/\AMare de 3\d\d m²\z/, alert["title"])
    assert alert["source"]["url"].present?
  end

  test "a region without rules has no alerts" do
    sign_in_as users(:michael)
    get map_alerts_path(maps(:ahinvaux)), as: :json
    assert_equal({ "alerts" => [], "rulesCount" => 0, "boundary" => true }, response.parsed_body)
  end

  test "strangers are refused" do
    sign_in_as users(:bob)
    get map_alerts_path(maps(:ahinvaux)), as: :json
    assert_response :not_found
  end
end
