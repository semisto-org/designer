require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# A project's « Temps et dépenses »: for its team, never its client.
class Maps::TimeEntriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  test "the team sees each phase, who did what and the hours noted" do
    @map.time_entries.create!(user: @designer, worked_on: Date.current, minutes: 120, phase: "commercial", trip_km: 30)
    sign_in_as users(:michael)
    get map_time_entries_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert props["canUse"]
    assert_nil props["envelopes"]["version"]
    commercial = props["envelopes"]["phases"].find { _1["key"] == "commercial" }
    assert_equal 2.0, commercial["hours"]
    assert_equal 30.0, commercial["km"]
    assert_equal [ @designer.display_name ], props["envelopes"]["people"].map { _1["name"] }
    assert_equal 1, props["entries"].size
  end

  test "the client is sent back to the map" do
    sign_in_as users(:alice)
    get map_time_entries_path(@map), headers: inertia_headers
    assert_redirected_to map_path(@map)
  end

  test "once shown the project, the client reads progress and expenses, never names or hours" do
    @map.time_entries.create!(user: @designer, worked_on: Date.current, minutes: 120, phase: "design")
    @map.project_expenses.create!(user: @designer, spent_on: Date.current, label: "Broyat", category: "mulch", amount_cents: 48_000, paid_by: "rebilled")
    @map.update!(time_shared_with_client: true)
    sign_in_as users(:alice)
    get map_time_entries_path(@map), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "maps/time_entries/client", body["component"]
    props = body["props"]
    assert_equal [ "Broyat" ], props["expenses"].map { _1["label"] }
    refute props.key?("entries")
    refute props.to_json.include?(@designer.display_name)
  end

  test "the team reads the expenses and whether the client sees them" do
    @map.project_expenses.create!(user: @designer, spent_on: Date.current, label: "Broyat", category: "mulch", amount_cents: 48_000, paid_by: "client")
    sign_in_as @designer
    get map_time_entries_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal 48_000, props["expenseSummary"]["totals"]["amountCents"]
    assert_equal false, props["sharedWithClient"]
    assert props["hasViewers"]
  end
end
