require "test_helper"
require_relative "../../test_helpers/agents_test_helper"

class Teams::AgentsControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @admin = make_user("Michael")
    @member = make_user("Chris")
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
    @staff = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  def page_props
    get team_agent_path(@team), headers: inertia_headers
    response.parsed_body["props"]
  end

  test "the page does not exist until Semisto opens the module, which only Semisto does" do
    sign_in_as @admin
    get team_agent_path(@team)
    assert_response :not_found
    patch team_agent_path(@team), params: { agent: { name: "Léa" } }
    assert_response :not_found
    patch admin_team_path(@team), params: { agents_module: "grant" }
    assert_not @team.reload.agents_module?

    sign_in_as @staff
    patch admin_team_path(@team), params: { agents_module: "grant" }
    assert @team.reload.agents_module?
    assert_equal "agents_module_granted", AdminEvent.newest_first.first.action
    get admin_teams_path, headers: inertia_headers
    assert response.parsed_body["props"]["teams"].find { _1["id"] == @team.id }["agentsModule"]

    patch admin_team_path(@team), params: { agents_module: "revoke" }
    assert_not @team.reload.agents_module?
  end

  test "an admin introduces her, gives the key and the ceiling; the key never comes back" do
    @team.grant_agents_module!
    sign_in_as @admin
    patch team_agent_path(@team), params: { agent: { name: "Léa", instructions: "Tutoie tout le monde." } }
    assert_redirected_to team_agent_path(@team)
    patch team_agent_path(@team), params: { settings: { api_key: " sk-ant-api03-secret-9XyZ ", monthly_budget: "35,5" } }

    @team.reload
    assert_equal "Léa", @team.team_agent.name
    assert_equal "sk-ant-api03-secret-9XyZ", @team.agent_api_key
    assert_equal 3550, @team.agent_monthly_budget_cents

    props = page_props
    assert props["ready"]
    assert_equal({ "keyHint" => "sk-ant-…9XyZ", "provider" => "anthropic", "model" => "claude-opus-5-5" }, props["settings"])
    assert_not_includes response.body, "secret-9XyZ"
    assert_equal "Tutoie tout le monde.", props["agent"]["instructions"]

    patch team_agent_path(@team), params: { settings: { api_key: "", monthly_budget: "40" } }
    assert_equal "sk-ant-api03-secret-9XyZ", @team.reload.agent_api_key, "an empty field keeps the key"
    patch team_agent_path(@team), params: { settings: { remove_api_key: true } }
    assert_nil @team.reload.agent_api_key
    assert_not page_props["ready"]

    patch team_agent_path(@team), params: { agent: { name: "Chris" } }
    assert_equal "Léa", @team.reload.team_agent.name, "a member's name is refused"
  end

  test "a member reads her page without the settings and changes nothing" do
    make_colleague(@team)
    sign_in_as @member
    props = page_props
    assert_nil props["settings"]
    assert_equal false, props["team"]["admin"]

    patch team_agent_path(@team), params: { agent: { name: "Zoé" } }
    assert_equal "Léa", @team.reload.team_agent.name

    get team_path(@team), headers: inertia_headers
    assert_equal({ "name" => "Léa", "ready" => true }, response.parsed_body["props"]["colleague"])
  end

  test "an admin switches her on map by map; nobody else does, and never on another team's map" do
    make_colleague(@team)
    map = colleague_map(@team, owner: @member, enabled: false)
    foreign = Map.create!(name: "Ailleurs", owner: @admin, region: regions(:wallonia))

    sign_in_as @member
    patch team_agent_map_path(@team, map), params: { enabled: true }
    assert_not map.reload.agent_enabled?

    sign_in_as @admin
    patch team_agent_map_path(@team, map), params: { enabled: true }
    assert map.reload.agent_enabled?
    assert_equal @admin, map.agent_enabled_by
    assert_equal [ true ], page_props["maps"].map { _1["enabled"] }
    patch team_agent_map_path(@team, foreign), params: { enabled: true }
    assert_response :not_found

    patch team_agent_map_path(@team, map), params: { enabled: false }
    assert_not map.reload.agent_enabled?
  end

  test "in a discussion: team members can mention her, everyone sees her, her answer is signed" do
    agent = make_colleague(@team)
    map = colleague_map(@team, owner: @admin)
    client = add_member(map, make_user("Cliente"), "editor")
    answer = Comment.create!(commentable: map, author: @member, agent:, body: "Voici ce que je propose.")

    sign_in_as @member
    post map_comments_path(map), params: { commentable_type: "Map", commentable_id: map.id, comment: { body: "@Léa une idée ?" } }, as: :json
    assert_response :created
    assert_equal({ "status" => "queued", "name" => "Léa" }, json["agentRun"])
    assert_equal [ { "id" => -agent.id, "handle" => "Léa" } ], json["mentions"]
    assert_enqueued_jobs 1, only: AgentRunJob

    get map_comments_path(map), params: { commentable_type: "Map", commentable_id: map.id }, as: :json
    assert_equal({ "id" => agent.id, "name" => "Léa", "canAsk" => true }, json["colleague"])
    assert_equal({ "id" => -agent.id, "name" => "Léa", "handle" => "Léa", "avatarUrl" => nil, "agent" => true }, json["members"].first)
    signed = json["comments"].find { _1["id"] == answer.id }
    assert_equal "Léa", signed["author"]["name"]
    assert_equal({ "id" => agent.id, "name" => "Léa", "requestedBy" => "Chris" }, signed["agent"])
    assert_equal false, signed["canEdit"], "nobody rewrites what she said"
    assert signed["canDelete"], "the member who asked may remove her answer"
    patch map_comment_path(map, answer), params: { comment: { body: "réécrit" } }, as: :json
    assert_response :forbidden

    sign_in_as client
    get map_comments_path(map), params: { commentable_type: "Map", commentable_id: map.id }, as: :json
    assert_equal false, json["colleague"]["canAsk"]
    assert(json["members"].none? { _1["agent"] })
  end

  test "in the tasks: a team member gives her a task, a client cannot" do
    agent = make_colleague(@team)
    map = colleague_map(@team, owner: @admin)
    client = add_member(map, make_user("Cliente"), "editor")
    list = map.task_lists.create!(name: "À faire")
    task = list.tasks.create!(title: "Proposer une haie", map:)

    sign_in_as client
    get map_tasks_path(map), headers: inertia_headers
    assert(response.parsed_body["props"]["participants"].none? { _1["agentId"] })
    patch map_task_path(map, task), params: { task: { agent_id: agent.id } }, as: :json
    assert_nil task.reload.agent_id

    sign_in_as @member
    get map_tasks_path(map), headers: inertia_headers
    assert_equal({ "agentId" => agent.id, "name" => "Léa", "role" => "agent", "group" => "agent" }, response.parsed_body["props"]["participants"].first)
    assert_enqueued_jobs 1, only: AgentRunJob do
      patch map_task_path(map, task), params: { task: { agent_id: agent.id } }, as: :json
    end
    assert_response :success
    assert_equal({ "agentId" => agent.id, "name" => "Léa", "agent" => true, "working" => true }, json["task"]["assignee"])
    run = AgentRun.find_by(source: task)
    assert_equal @member, run.requested_by
    assert_no_enqueued_emails

    patch map_task_path(map, task), params: { task: { assignee_id: nil, invitee_email: nil, agent_id: nil } }, as: :json
    assert_nil task.reload.agent_id
  end
end
