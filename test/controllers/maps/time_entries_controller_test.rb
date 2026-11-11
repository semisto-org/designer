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
end
