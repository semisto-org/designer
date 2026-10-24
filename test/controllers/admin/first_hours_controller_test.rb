require "test_helper"
require_relative "../../test_helpers/first_hour_test_helper"

class Admin::FirstHoursControllerTest < ActionDispatch::IntegrationTest
  include FirstHourTestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true, created_at: 1.year.ago)
    # The fixtures' accounts signed up long ago: only this test's newcomers are in the period.
    User.update_all(created_at: 1.year.ago)
  end

  test "staff see how each newcomer began, counted from the sign-up, with their feedback and replays" do
    signed_up = 2.days.ago.change(usec: 0)
    tester = User.create!(email_address: "testeuse@example.org", name: "Testeuse", created_at: signed_up, replay_consent: true)
    map = Map.create!(name: "Le verger", owner: tester, region: regions(:wallonia), created_at: signed_up + 4.minutes)
    map.update_columns(boundary: map.class.connection.select_value("SELECT ST_Multi(ST_GeomFromText('POLYGON((4.9 50.34, 4.901 50.34, 4.901 50.341, 4.9 50.341, 4.9 50.34))', 4326))"),
      outlined_at: signed_up + 12.minutes, plan_printed_at: signed_up + 3.hours)
    map.features.create!(layer: "plants", kind: "tree", geometry: point, created_at: signed_up + 35.minutes)
    map.features.create!(layer: "plants", kind: "tree", geometry: point, status: "draft", created_at: signed_up + 1.minute)
    tester.session_replays.create!(replay_id: replay_id(1))
    tester.feedbacks.create!(message: "Où est le contour ?", path: "/maps/#{map.id}", map:, wants_call: true, sentry_replay_id: replay_id(1))
    # Signed up long ago: outside the period.
    User.create!(email_address: "ancien@example.org", name: "Ancien", created_at: 1.year.ago)

    sign_in_as @admin
    with_replay_env("SENTRY_ORG" => "semisto") do
      get admin_first_hours_path, headers: inertia_headers
    end
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal 30, props["days"]
    people = props["report"]["people"]
    assert_equal [ "testeuse@example.org" ], people.map { _1["email"] }
    person = people.first
    assert_equal({ "map" => 4, "outline" => 12, "plant" => 35, "print" => 180 }, person["milestones"].transform_values { _1["minutes"] })
    assert_equal({ "id" => map.id, "name" => "Le verger" }, person["map"])
    assert_equal true, person["replayConsent"]
    assert_equal 1, person["feedbacks"]
    assert_equal [ "https://semisto.sentry.io/replays/#{replay_id(1)}/" ], person["replays"].map { _1["url"] }

    summary = props["report"]["summary"]
    assert_equal 1, summary["people"]
    assert_equal({ "reached" => 1, "firstHour" => 0 }, summary["milestones"]["print"])
    assert_equal({ "reached" => 1, "firstHour" => 1 }, summary["milestones"]["outline"])

    feedback = props["feedbacks"].first
    assert_equal "Où est le contour ?", feedback["message"]
    assert_equal true, feedback["wantsCall"]
    assert_equal "testeuse@example.org", feedback["author"]["email"]
    assert_equal "https://semisto.sentry.io/replays/#{replay_id(1)}/", feedback["replayUrl"]
    assert_equal({ "enabled" => true, "perUser" => 2, "linked" => true }, props["replay"])
  end

  test "an outline drawn before the moments were dated still counts, without a time" do
    tester = User.create!(email_address: "avant@example.org", name: "Avant", created_at: 3.days.ago)
    Map.create!(name: "Ancien contour", owner: tester, region: regions(:wallonia), boundary: square).update_column(:outlined_at, nil)
    sign_in_as @admin
    get admin_first_hours_path(days: 7), headers: inertia_headers
    person = response.parsed_body["props"]["report"]["people"].find { _1["email"] == "avant@example.org" }
    assert_equal({ "at" => nil, "minutes" => nil }, person["milestones"]["outline"])
    assert_nil person["milestones"]["print"]
  end

  test "is hidden from everyone else" do
    sign_in_as users(:alice)
    get admin_first_hours_path
    assert_response :not_found
  end
end
