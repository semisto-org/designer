require "test_helper"
require_relative "../test_helpers/first_hour_test_helper"

class SessionReplayTest < ActiveSupport::TestCase
  include FirstHourTestHelper

  test "the question is asked once Sentry is on, and the answer is kept with its date" do
    user = users(:alice)
    assert_equal "off", user.session_replay_state, "no SENTRY_DSN, no recording and no question"
    with_replay_env do
      assert_equal "ask", user.session_replay_state
      travel_to Time.zone.local(2026, 10, 26, 9, 0) do
        user.answer_replay_consent!(false)
      end
      assert_equal "off", user.reload.session_replay_state
      assert_equal Time.zone.local(2026, 10, 26, 9, 0), user.replay_consent_at
    end
  end

  test "a yes records the first sessions, then lets the last one finish without starting another" do
    user = users(:alice)
    with_replay_env("SENTRY_REPLAY_SESSIONS" => "2") do
      user.answer_replay_consent!(true)
      assert_equal "record", user.session_replay_state
      user.session_replays.create!(replay_id: replay_id(1))
      assert_equal "record", user.session_replay_state
      user.session_replays.create!(replay_id: replay_id(2))
      assert_equal "keep", user.session_replay_state
    end
    with_replay_env("SENTRY_REPLAY_SESSIONS" => "0") do
      assert_equal "off", user.session_replay_state, "0 sessions turns recording off for everyone"
    end
  end

  test "replay ids are Sentry's, once per person, and link to Sentry when SENTRY_ORG is set" do
    user = users(:alice)
    assert_not user.session_replays.new(replay_id: "not-an-id").valid?
    user.session_replays.create!(replay_id: replay_id(7))
    assert_not user.session_replays.new(replay_id: replay_id(7)).valid?
    assert users(:bob).session_replays.new(replay_id: replay_id(7)).valid?

    replay = user.session_replays.first
    with_replay_env("SENTRY_ORG" => nil) { assert_nil replay.url }
    with_replay_env("SENTRY_ORG" => "semisto") { assert_equal "https://semisto.sentry.io/replays/#{replay_id(7)}/", replay.url }
  end
end
