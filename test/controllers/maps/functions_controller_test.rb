require "test_helper"

class Maps::FunctionsControllerTest < ActionDispatch::IntegrationTest
  test "members read what each element does and which functions are fragile" do
    sign_in_as users(:alice)
    get map_functions_path(maps(:ahinvaux)), as: :json
    assert_response :success

    body = response.parsed_body
    pond = body["entries"].sole
    assert_equal [ "feature:#{map_features(:pond).id}", "kind", [ map_features(:pond).id ] ], pond.values_at("key", "origin", "featureIds")
    assert_includes pond["functions"], "water"
    water = body["balance"].find { |b| b["function"] == "water" }
    assert_equal [ 1, "fragile", [ pond["key"] ] ], water.values_at("count", "status", "entries")
    assert_equal ElementFunctions::FUNCTIONS, body["functions"]
  end

  test "strangers are refused" do
    sign_in_as users(:bob)
    get map_functions_path(maps(:ahinvaux)), as: :json
    assert_response :not_found
  end
end
