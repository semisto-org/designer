require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class AiTrialTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @user = users(:bob)
    @client = OauthClient.create!(name: "Claude", redirect_uris: [ "https://claude.ai/api/mcp/auth_callback" ], token_endpoint_auth_method: "none")
  end

  def connect(scopes) = OauthAccessToken.issue!(user: @user, client: @client, scopes:, resource: "http://www.example.com/mcp")

  test "nothing starts while billing is off" do
    connect("maps:read maps:drafts")
    assert_nil @user.reload.ai_trial_started_at
    assert_nil @user.ai_trial_as_json
  end

  test "a read-only connection does not start it; the first one with drafts does, once" do
    with_billing do
      assert_equal "available", @user.ai_trial_state
      refute @user.entitlements.ai_drafts?

      connect("maps:read")
      assert_nil @user.reload.ai_trial_started_at

      travel_to Time.zone.local(2027, 3, 1, 10, 0) do
        connect("maps:read maps:drafts")
        assert_equal Time.zone.local(2027, 3, 15, 10, 0), @user.reload.ai_trial_ends_at
      end

      travel_to Time.zone.local(2027, 3, 5, 10, 0) do
        connect("maps:read maps:drafts")   # a refresh or a second assistant
        assert_equal Time.zone.local(2027, 3, 15, 10, 0), @user.reload.ai_trial_ends_at
        user = User.find(@user.id)
        assert user.entitlements.ai_drafts?
        assert_equal Time.zone.local(2027, 3, 15, 10, 0), user.entitlements.ai_trial_ends_at
        refute user.entitlements.pdf_export?, "the trial opens drafts only"
        assert_equal({ state: "active", days: 14, endsAt: "2027-03-15T10:00:00+01:00", daysLeft: 10 }, user.ai_trial_as_json)
      end

      travel_to Time.zone.local(2027, 3, 15, 10, 1) do
        user = User.find(@user.id)
        refute user.entitlements.ai_drafts?
        assert_equal "ended", user.ai_trial_state
      end
    end
  end

  test "a personal token with drafts access starts it too" do
    with_billing do
      ApiToken.create!(user: @user, name: "Script", access: "read")
      assert_nil @user.reload.ai_trial_started_at
      ApiToken.create!(user: @user, name: "Claude Code", access: "drafts")
      assert @user.reload.ai_trial_active?
    end
  end

  test "the mobile app never starts it" do
    with_billing do
      OauthAccessToken.issue!(user: @user, client: MobileApp.client, scopes: MobileApp::SCOPES, resource: "http://www.example.com/mcp")
      assert_nil @user.reload.ai_trial_started_at
    end
  end

  test "a paid plan does not need it" do
    with_billing do
      @user.plan_purchases.create!(plan_key: "yearly", starts_at: 1.day.ago, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_trial")
      assert_nil @user.ai_trial_state
      connect("maps:read maps:drafts")
      user = User.find(@user.id)
      assert user.entitlements.ai_drafts?
      refute user.entitlements.ai_trial?, "drafts come from the plan"
    end
  end
end
