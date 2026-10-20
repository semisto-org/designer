require "test_helper"
require_relative "../../test_helpers/first_hour_test_helper"

class Account::ReplayConsentsControllerTest < ActionDispatch::IntegrationTest
  include FirstHourTestHelper

  test "the question shows on every page until answered, then the answer decides" do
    user = users(:alice)
    sign_in_as user
    with_replay_env do
      get account_path, headers: inertia_headers
      assert_equal "ask", response.parsed_body.dig("props", "sessionReplay")
      assert_equal 2, response.parsed_body.dig("props", "env", "replaySessions")

      patch account_replay_consent_path, params: { consent: true }, as: :json
      assert_response :success
      assert_equal "record", response.parsed_body["state"]
      assert user.reload.replay_consent
      assert user.replay_consent_at

      get account_path, headers: inertia_headers
      assert_equal "record", response.parsed_body.dig("props", "sessionReplay")
      assert_equal({ "enabled" => true, "consent" => true, "sessions" => 0, "perUser" => 2 }, response.parsed_body.dig("props", "account", "replay"))

      patch account_replay_consent_path, params: { consent: false }, as: :json
      assert_equal "off", response.parsed_body["state"]
      assert_equal false, user.reload.replay_consent
    end
  end

  test "without Sentry nothing is asked" do
    sign_in_as users(:alice)
    get account_path, headers: inertia_headers
    assert_equal "off", response.parsed_body.dig("props", "sessionReplay")
  end

  test "an answer it cannot read is refused" do
    sign_in_as users(:alice)
    patch account_replay_consent_path, params: { consent: "peut-être" }, as: :json
    assert_response :unprocessable_entity
    assert_nil users(:alice).reload.replay_consent
  end

  test "never asked, recorded or answered while an admin is signed in as someone" do
    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    post admin_user_impersonation_path(users(:alice))
    with_replay_env do
      get account_path, headers: inertia_headers
      assert_equal "off", response.parsed_body.dig("props", "sessionReplay")
      patch account_replay_consent_path, params: { consent: true }, as: :json
    end
    assert_nil users(:alice).reload.replay_consent
  end
end
