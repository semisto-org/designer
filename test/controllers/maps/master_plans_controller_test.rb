require "test_helper"

class Maps::MasterPlansControllerTest < ActionDispatch::IntegrationTest
  test "anyone on the map reads the master plan; a stranger does not" do
    map = maps(:ahinvaux)
    sign_in_as users(:alice)
    get map_master_plan_path(map), as: :json
    assert_response :success
    assert response.parsed_body.key?("themes")

    sign_in_as users(:bob)
    get map_master_plan_path(map), as: :json
    assert_response :not_found
  end
end
