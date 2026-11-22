require "test_helper"

class Maps::SectionsControllerTest < ActionDispatch::IntegrationTest
  test "anyone on the map cuts a section; a bad line is explained; a stranger does not" do
    map = maps(:ahinvaux)
    sign_in_as users(:alice)
    get map_design_section_path(map, line: "4.9071,50.3410;4.9072,50.3413", corridor: 10), as: :json
    assert_response :success
    assert_equal 10.0, response.parsed_body["corridorM"]
    assert response.parsed_body.key?("plants")

    get map_design_section_path(map, line: "4.9071,50.3410"), as: :json
    assert_response :unprocessable_content
    assert_equal "line", response.parsed_body["code"]

    sign_in_as users(:bob)
    get map_design_section_path(map, line: "4.9071,50.3410;4.9072,50.3413"), as: :json
    assert_response :not_found
  end
end
