require "test_helper"
require_relative "../../test_helpers/first_hour_test_helper"

class Account::SessionReplaysControllerTest < ActionDispatch::IntegrationTest
  include FirstHourTestHelper

  setup do
    @user = users(:alice)
    sign_in_as @user
  end

  test "records the first sessions of someone who said yes, and no more" do
    with_replay_env("SENTRY_REPLAY_SESSIONS" => "2") do
      @user.answer_replay_consent!(true)
      post account_session_replays_path, params: { replay_id: replay_id(1), path: "/maps/3" }, as: :json
      assert_equal({ "recorded" => true, "state" => "record" }, response.parsed_body)

      # The same tab after a reload: the same session, still fine.
      post account_session_replays_path, params: { replay_id: replay_id(1) }, as: :json
      assert_equal true, response.parsed_body["recorded"]

      post account_session_replays_path, params: { replay_id: replay_id(2) }, as: :json
      assert_equal({ "recorded" => true, "state" => "keep" }, response.parsed_body)

      post account_session_replays_path, params: { replay_id: replay_id(3) }, as: :json
      assert_equal false, response.parsed_body["recorded"], "the browser stops a third session"
      assert_equal [ replay_id(1), replay_id(2) ], @user.session_replays.oldest_first.pluck(:replay_id)
      assert_equal "/maps/3", @user.session_replays.oldest_first.first.path

      # The session already recording finishes; nothing new starts.
      post account_session_replays_path, params: { replay_id: replay_id(2) }, as: :json
      assert_equal true, response.parsed_body["recorded"]
    end
  end

  test "nothing is recorded without a yes" do
    with_replay_env do
      post account_session_replays_path, params: { replay_id: replay_id(1) }, as: :json
      assert_equal({ "recorded" => false, "state" => "ask" }, response.parsed_body)
      @user.answer_replay_consent!(false)
      post account_session_replays_path, params: { replay_id: replay_id(1) }, as: :json
      assert_equal false, response.parsed_body["recorded"]
    end
    assert_equal 0, @user.session_replays.count
  end

  test "a malformed id is not kept" do
    with_replay_env do
      @user.answer_replay_consent!(true)
      post account_session_replays_path, params: { replay_id: "<script>" }, as: :json
      assert_equal false, response.parsed_body["recorded"]
    end
    assert_equal 0, @user.session_replays.count
  end
end
