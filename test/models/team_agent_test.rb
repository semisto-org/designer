require "test_helper"
require_relative "../test_helpers/agents_test_helper"

class TeamAgentTest < ActiveSupport::TestCase
  setup do
    @admin = make_user("Michael")
    @member = make_user("Chris")
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
  end

  test "her name is a first name nobody of the team bears" do
    assert_not @team.build_team_agent(name: "").valid?
    assert_not @team.build_team_agent(name: "L3a!").valid?
    taken = @team.build_team_agent(name: "chris")
    assert_not taken.valid?
    assert taken.errors.of_kind?(:name, :taken_by_member)
    assert @team.build_team_agent(name: "Léa").valid?
  end

  test "the team's key is stored encrypted and only its hint is readable" do
    @team.update!(agent_api_key: "sk-ant-api03-secret-value-9XyZ")
    raw = Organization.connection.select_value("SELECT agent_api_key FROM organizations WHERE id = #{@team.id}")
    assert_not_includes raw, "secret-value"
    assert_equal "sk-ant-api03-secret-value-9XyZ", @team.reload.agent_api_key
    assert_equal "sk-ant-…9XyZ", @team.agent_api_key_hint

    @team.update!(agent_api_key: "")
    assert_nil @team.reload.agent_api_key
    assert_nil @team.agent_api_key_hint
  end

  test "the colleague can be asked only with the module, a key and not paused" do
    assert_nil @team.colleague
    agent = make_colleague(@team)
    assert_equal agent, @team.reload.colleague

    agent.update!(active: false)
    assert_nil @team.reload.colleague
    agent.update!(active: true)

    @team.update!(agent_api_key: nil)
    assert_nil @team.reload.colleague
    @team.update!(agent_api_key: "sk-ant-test-0123456789")

    @team.revoke_agents_module!
    assert_nil @team.reload.colleague
  end

  test "she works on a map only once switched on, for team members only, and leaves with the map" do
    agent = make_colleague(@team)
    map = colleague_map(@team, owner: @admin, enabled: false)
    client = add_member(map, make_user("Cliente"), "editor")
    assert_nil map.colleague

    map.update!(agent_enabled_at: Time.current)
    assert_equal agent, map.colleague
    assert_equal agent, map.colleague_for(@member)
    assert_nil map.colleague_for(client), "a client on the map cannot ask her"

    map.update!(organization: nil)
    assert_nil map.reload.agent_enabled_at
    assert_nil map.colleague
  end

  test "the monthly ceiling counts this month's runs only" do
    agent = make_colleague(@team)
    map = colleague_map(@team, owner: @admin)
    comment = Comment.create!(commentable: map, author: @admin, body: "Bonjour")
    @team.update!(agent_monthly_budget_cents: 100)
    run = AgentRun.create!(team_agent: agent, organization: @team, map:, requested_by: @admin, source: comment, cost_micros: 999_999)
    assert @team.agent_budget_left?
    run.update!(cost_micros: 1_000_000)
    assert_not @team.agent_budget_left?
    run.update!(created_at: 2.months.ago)
    assert @team.agent_budget_left?
  end
end
