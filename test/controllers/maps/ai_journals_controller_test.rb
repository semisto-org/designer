require "test_helper"

class Maps::AiJournalsControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "the owner opens « Journal IA » as a view of the project" do
    sign_in_as users(:michael)
    get map_ai_journal_path(@map), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/ai_journals/show", page["component"]
    assert_equal @map.id, page["props"]["map"]["id"]
    assert_equal "owner", page["props"]["map"]["role"]
    assert page["props"]["map"].key?("offerBuilder")
  end

  test "only the owner: anyone else goes back to the map" do
    sign_in_as users(:alice)
    get map_ai_journal_path(@map)
    assert_redirected_to map_path(@map)
  end
end
