require "test_helper"
require_relative "../../test_helpers/agents_test_helper"

class Teams::AgentAvatarsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = make_user("Michael")
    @member = make_user("Chris")
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
    @agent = make_colleague(@team)
  end

  test "a team admin gives her a picture, shown wherever she appears" do
    sign_in_as @admin
    patch team_agent_avatar_path(@team), params: { agent: { avatar: fixture_file_upload("terrain.jpg", "image/jpeg") } }
    assert_redirected_to team_agent_path(@team)
    assert @agent.reload.avatar.attached?
    assert_equal avatar_path(@agent.avatar.blob.signed_id), @agent.avatar_url
    assert_equal @agent.avatar_url, @agent.as_json[:avatarUrl]

    map = colleague_map(@team, owner: @admin)
    task = map.task_lists.create!(name: "À faire").tasks.create!(title: "Palette de la haie", map:, agent: @agent)
    assert_equal @agent.avatar_url, task.as_json[:assignee][:avatarUrl]

    # Served like a person's picture, without signing in.
    sign_out
    get @agent.avatar_url
    assert_response :redirect
  end

  test "refuses a file that is not an image, and a missing one" do
    sign_in_as @admin
    patch team_agent_avatar_path(@team), params: { agent: { avatar: fixture_file_upload("notes.txt", "text/plain") } }
    assert_redirected_to team_agent_path(@team)
    assert_not @agent.reload.avatar.attached?
    patch team_agent_avatar_path(@team), params: { agent: { name: "x" } }
    assert_not @agent.reload.avatar.attached?
  end

  test "removing it brings back the sparkle" do
    @agent.avatar.attach(fixture_file_upload("plant.png", "image/png"))
    sign_in_as @admin
    delete team_agent_avatar_path(@team)
    assert_redirected_to team_agent_path(@team)
    assert_not @agent.reload.avatar.attached?
    assert_nil @agent.avatar_url
  end

  test "only an admin of the team changes it, and only once she exists" do
    sign_in_as @member
    patch team_agent_avatar_path(@team), params: { agent: { avatar: fixture_file_upload("plant.png", "image/png") } }
    assert_not @agent.reload.avatar.attached?

    other = make_team("Autre", admin: @admin)
    sign_in_as @admin
    patch team_agent_avatar_path(other), params: { agent: { avatar: fixture_file_upload("plant.png", "image/png") } }
    assert_response :not_found
  end
end
