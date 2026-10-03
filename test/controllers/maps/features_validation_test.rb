require "test_helper"

# The features API refuses elements that do not match the library, with a
# French message the editor shows as is.
class Maps::FeaturesValidationTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:michael) }

  test "creates a library element with its default properties" do
    post map_features_path(maps(:ahinvaux)), params: { feature: { layer: "structures", kind: "hedge", geometry: { type: "LineString", coordinates: [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] } } }, as: :json
    assert_response :created
    assert_equal 2, response.parsed_body.dig("properties", "rows")
    assert_equal 1, response.parsed_body.dig("properties", "spacing_m")
  end

  test "refuses a wrong geometry with a French message" do
    post map_features_path(maps(:ahinvaux)), params: { feature: { layer: "water", kind: "pond", geometry: point } }, as: :json
    assert_response :unprocessable_entity
    assert_equal "« Mare » se dessine comme une surface.", response.parsed_body["message"]
  end

  test "refuses out-of-range properties on update" do
    pond = map_features(:pond)
    patch map_feature_path(maps(:ahinvaux), pond), params: { feature: { properties: { depth_m: 40 }, lock_version: pond.lock_version } }, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["message"], "Profondeur de « Mare » doit être compris entre 0,1 et 6 m"
  end
end
