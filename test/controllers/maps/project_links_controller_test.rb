require "test_helper"

class Maps::ProjectLinksControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "an editor creates the link, resets it and switches it off" do
    sign_in_as users(:michael)
    post map_project_link_path(@map), as: :json
    assert_response :created
    link = @map.reload.project_sheet_link
    assert_equal users(:michael), link.created_by
    assert_equal "http://www.example.com/fiche-projet/#{link.token}", response.parsed_body.dig("formLink", "url")
    assert_equal true, response.parsed_body.dig("formLink", "enabled")

    old = link.token
    post reset_map_project_link_path(@map), as: :json
    assert_response :success
    refute_equal old, link.reload.token

    delete map_project_link_path(@map), as: :json
    assert_response :success
    assert_equal false, response.parsed_body.dig("formLink", "enabled")
    refute link.reload.enabled?

    # Switching it on again keeps the same address.
    post map_project_link_path(@map), as: :json
    assert link.reload.enabled?
    assert_equal 1, ProjectSheetLink.where(map: @map).count
  end

  test "viewers and strangers cannot touch it" do
    sign_in_as users(:alice)
    post map_project_link_path(@map), as: :json
    assert_response :forbidden
    sign_in_as users(:bob)
    post map_project_link_path(@map), as: :json
    assert_response :not_found
    assert_nil @map.reload.project_sheet_link
  end

  test "the sheet gives the link to editors only" do
    link = @map.create_project_sheet_link!(created_by: users(:michael))
    sign_in_as users(:michael)
    get map_project_path(@map), as: :json
    assert_equal "http://www.example.com/fiche-projet/#{link.token}", response.parsed_body.dig("formLink", "url")
    sign_in_as users(:alice)
    get map_project_path(@map), as: :json
    assert_nil response.parsed_body["formLink"]
  end
end
