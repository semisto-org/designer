require "test_helper"

class Maps::ProjectsControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "requires sign in" do
    get map_project_path(@map)
    assert_redirected_to new_session_path
  end

  test "hides the sheet of a map you cannot see" do
    sign_in_as users(:bob)
    get map_project_path(@map), as: :json
    assert_response :not_found
    patch map_project_path(@map), params: { project: { budget: { initial: "under_500" } } }, as: :json
    assert_response :not_found
  end

  test "the page renders with the sheet, its progress and the schema" do
    @map.update!(project: { "budget" => { "initial" => "under_500" } })
    sign_in_as users(:michael)
    get map_project_path(@map), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "maps/project", body["component"]
    props = body["props"]
    assert_equal({ "budget" => { "initial" => "under_500" } }, props["project"])
    assert_equal 3, props["progress"]["percent"]
    assert_equal 33, props["progress"]["sections"]["budget"]["percent"]
    assert_equal 10, props["schema"]["sections"].size
    assert_equal true, props["canEdit"]
    assert_equal "owner", props["map"]["role"]
  end

  test "the editor panel reads the same data as JSON" do
    sign_in_as users(:michael)
    get map_project_path(@map), as: :json
    assert_response :success
    assert_equal %w[canEdit drafts map progress project schema], response.parsed_body.keys.sort
  end

  test "autosave merges fields and answers with the new progress" do
    sign_in_as users(:michael)
    patch map_project_path(@map), params: { project: { budget: { initial: "up_to_2000" } } }, as: :json
    assert_response :success
    assert_equal "up_to_2000", response.parsed_body.dig("project", "budget", "initial")
    assert_equal 33, response.parsed_body.dig("progress", "sections", "budget", "percent")

    patch map_project_path(@map), params: { project: { budget: { yearly: "under_100" }, time: { hours_per_week: 6 } } }, as: :json
    assert_response :success
    stored = @map.reload.project
    assert_equal({ "initial" => "up_to_2000", "yearly" => "under_100" }, stored["budget"])
    assert_equal({ "hours_per_week" => 6 }, stored["time"])
    assert stored.dig("meta", "touched", "budget").present?
  end

  test "clearing a field removes it" do
    @map.update!(project: { "budget" => { "initial" => "under_500", "yearly" => "under_100" } })
    sign_in_as users(:michael)
    patch map_project_path(@map), params: { project: { budget: { initial: nil } } }, as: :json
    assert_response :success
    assert_equal({ "yearly" => "under_100" }, @map.reload.project["budget"])
  end

  test "invalid values are refused with their paths, nothing is saved" do
    sign_in_as users(:michael)
    patch map_project_path(@map), params: { project: { budget: { initial: "a_fortune" } } }, as: :json
    assert_response :unprocessable_entity
    assert_equal "inclusion", response.parsed_body.dig("errors", "budget.initial")
    assert_equal({}, @map.reload.project)
  end

  test "unknown keys are ignored, not stored" do
    sign_in_as users(:michael)
    patch map_project_path(@map), params: { project: { hacker: { x: 1 }, who: { profile: "farm", admin: true } } }, as: :json
    assert_response :success
    assert_equal({ "who" => { "profile" => "farm" }, "meta" => { "touched" => { "who" => @map.reload.project.dig("meta", "touched", "who") } } }, @map.project)
  end

  test "marking a section as done" do
    sign_in_as users(:michael)
    patch map_project_path(@map), params: { project: { meta: { done: [ "livestock" ] } } }, as: :json
    assert_response :success
    assert_equal 100, response.parsed_body.dig("progress", "sections", "livestock", "percent")
    assert_equal [ "livestock" ], @map.reload.project.dig("meta", "done")
  end

  test "editors can write, viewers can only read" do
    @map.memberships.create!(user: users(:bob), role: "editor")
    sign_in_as users(:bob)
    patch map_project_path(@map), params: { project: { uses: { presence: "weekends" } } }, as: :json
    assert_response :success

    sign_in_as users(:alice)
    get map_project_path(@map), as: :json
    assert_response :success
    assert_equal false, response.parsed_body["canEdit"]
    patch map_project_path(@map), params: { project: { uses: { presence: "daily" } } }, as: :json
    assert_response :forbidden
    assert_equal "weekends", @map.reload.project.dig("uses", "presence")
  end

  test "the generic map update no longer accepts a project payload" do
    sign_in_as users(:michael)
    patch map_path(@map), params: { map: { project: { hacker: 1 } } }, as: :json
    assert_equal({}, @map.reload.project)
  end

  test "the Map model refuses an invalid sheet written any other way" do
    @map.project = { "budget" => { "initial" => "a_fortune" } }
    assert_not @map.valid?
    assert @map.errors[:project].any?
    @map.project = { "budget" => { "initial" => "under_500" }, "another_area" => { "free" => "form" } }
    assert @map.valid?, "keys other areas may add are tolerated"
  end

  test "stored values that no longer fit never block saving the map" do
    @map.update_columns(project: { "budget" => { "initial" => "removed_value" } })
    assert @map.reload.update(stage: "plant")
  end

  test "an admin reads the sheet while a request is open" do
    admin = User.create!(email_address: "staff@example.org", admin: true)
    sign_in_as admin
    get map_project_path(@map), as: :json
    assert_response :not_found
    @map.service_requests.create!(user: users(:michael), kind: "co_management", contact_consent: true, payload: { "message" => "Salut" })
    get map_project_path(@map), as: :json
    assert_response :success
    assert_equal false, response.parsed_body["canEdit"]
  end
end
