require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class PlanResolutionTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup { @user = users(:bob) }

  def pass(user: @user, starts_at: 1.month.ago, expires_at: 11.months.from_now, status: "paid")
    user.plan_purchases.create!(plan_key: "yearly", status:, starts_at:, expires_at:, stripe_checkout_session_id: "cs_#{SecureRandom.hex(4)}")
  end

  def subscription(status: "active", plan_key: "atelier", past_due_since: nil)
    @user.plan_subscriptions.create!(plan_key:, status:, past_due_since:, stripe_subscription_id: "sub_#{SecureRandom.hex(4)}")
  end

  test "free without any purchase" do
    assert_equal "free", @user.current_plan_key
  end

  test "yearly while the pass is valid" do
    pass
    assert_equal "yearly", @user.current_plan_key
  end

  test "back to free the moment the pass expires" do
    pass(starts_at: 13.months.ago, expires_at: 1.month.ago)
    assert_equal "free", @user.current_plan_key
    assert_equal "yearly", @user.current_plan_key(at: 13.months.ago + 1.day)
  end

  test "a pass that has not started yet does not count, a refunded one never does" do
    pass(starts_at: 1.week.from_now, expires_at: 1.year.from_now + 1.week)
    assert_equal "free", @user.current_plan_key
    pass(status: "refunded")
    assert_equal "free", @user.current_plan_key
  end

  test "drone purchases never give a plan" do
    @user.plan_purchases.create!(plan_key: "drone", starts_at: Time.current, stripe_checkout_session_id: "cs_drone")
    assert_equal "free", @user.current_plan_key
  end

  test "active and trialing subscriptions give their plan" do
    sub = subscription(plan_key: "bureau")
    assert_equal "bureau", @user.current_plan_key
    sub.update!(status: "trialing", plan_key: "atelier")
    assert_equal "atelier", @user.current_plan_key
  end

  test "past due keeps access during the grace period only" do
    sub = subscription(status: "past_due", past_due_since: 3.days.ago)
    assert_equal "atelier", @user.current_plan_key
    sub.update!(past_due_since: 8.days.ago)
    assert_equal "free", @user.current_plan_key
    sub.update!(past_due_since: nil)
    assert_equal "free", @user.current_plan_key
  end

  test "canceled, unpaid and incomplete subscriptions give nothing" do
    %w[canceled unpaid incomplete incomplete_expired paused].each do |status|
      @user.plan_subscriptions.destroy_all
      subscription(status:)
      assert_equal "free", @user.current_plan_key, status
    end
  end

  test "the plan with the most maps wins when several apply" do
    pass
    subscription(plan_key: "atelier")
    assert_equal "yearly", @user.current_plan_key
    subscription(plan_key: "bureau")
    assert_equal "bureau", @user.current_plan_key
  end

  def grant(plan_key: "bureau", starts_at: 1.month.ago, ends_at: 11.months.from_now)
    @user.plan_grants.create!(plan_key:, starts_at:, ends_at:)
  end

  test "a plan granted on invoice counts while it runs" do
    grant
    assert_equal "bureau", @user.current_plan_key
  end

  test "an expired, future or revoked grant gives nothing (and nothing is deleted)" do
    expired = grant(starts_at: 13.months.ago, ends_at: 1.month.ago)
    assert_equal "free", @user.current_plan_key
    assert_equal "bureau", @user.current_plan_key(at: 6.months.ago)
    grant(starts_at: 1.week.from_now, ends_at: 1.year.from_now)
    assert_equal "free", @user.current_plan_key
    grant.revoke!
    assert_equal "free", @user.current_plan_key
    assert_equal 3, @user.plan_grants.count
    assert PlanGrant.exists?(expired.id)
  end

  test "the best plan wins between grants, passes and subscriptions" do
    grant(plan_key: "atelier")
    assert_equal "atelier", @user.current_plan_key
    pass
    assert_equal "yearly", @user.current_plan_key
    grant(plan_key: "bureau")
    assert_equal "bureau", @user.current_plan_key
    @user.plan_grants.update_all(revoked_at: Time.current)
    subscription(plan_key: "atelier")
    assert_equal "yearly", @user.current_plan_key
  end

  test "maps beyond a grant's limit become read-only when it ends" do
    with_billing do
      current = grant(plan_key: "atelier")
      3.times { |i| Map.create!(name: "Carte #{i}", owner: @user, region: regions(:wallonia)) }
      assert_equal 0, @user.read_only_maps_count
      current.update!(ends_at: 1.minute.ago)
      assert_equal 2, @user.reload.read_only_maps_count
      assert_equal 3, @user.owned_maps.count
    end
  end

  test "Entitlements follows the user's plan" do
    with_billing do
      assert_equal 1, Entitlements.for(@user).max_maps
      pass
      assert_equal "yearly", Entitlements.for(@user).plan
      assert Entitlements.for(@user).pdf_export?
    end
  end

  test "next pass window starts at the end of the valid pass" do
    current = pass(expires_at: 2.months.from_now)
    starts_at, expires_at = PlanPurchase.next_pass_window(@user, Time.current)
    assert_in_delta current.expires_at, starts_at, 1
    assert_in_delta current.expires_at + 1.year, expires_at, 1
    @user.plan_purchases.destroy_all
    starts_at, = PlanPurchase.next_pass_window(@user, Time.current)
    assert_in_delta Time.current, starts_at, 2
  end
end
