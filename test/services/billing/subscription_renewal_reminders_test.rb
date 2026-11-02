require "test_helper"

class Billing::SubscriptionRenewalRemindersTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup do
    @user = users(:bob)
    @now = Time.zone.local(2027, 6, 1, 8, 0)
  end

  def subscription(renews_at, period: 1.year, status: "active", cancel_at_period_end: false)
    @user.plan_subscriptions.create!(plan_key: "atelier", status:, cancel_at_period_end:, stripe_subscription_id: "sub_#{SecureRandom.hex(4)}",
                                     current_period_start: renews_at - period, current_period_end: renews_at)
  end

  def run_reminders(at = @now) = Billing::SubscriptionRenewalReminders.call(now: at)

  test "nothing more than 45 days before a yearly renewal" do
    subscription(@now + 46.days)
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "writes once per renewal, 45 days before, however often the job runs" do
    sub = subscription(@now + 45.days)
    assert_enqueued_emails 1 do
      assert_equal 1, run_reminders
      assert_equal 0, run_reminders(@now + 1.day)
      assert_equal 0, run_reminders(@now + 20.days)
    end
    assert_equal sub.current_period_end, sub.reload.renewal_reminded_for
  end

  test "writes again for the next year's renewal" do
    sub = subscription(@now + 40.days)
    assert_equal 1, run_reminders
    sub.update!(current_period_start: @now + 40.days, current_period_end: @now + 40.days + 1.year)
    assert_equal 0, run_reminders(@now + 41.days)
    assert_equal 1, run_reminders(@now + 40.days + 1.year - 44.days)
  end

  test "monthly, canceling and ended subscriptions get nothing" do
    subscription(@now + 20.days, period: 1.month)
    subscription(@now + 20.days, cancel_at_period_end: true)
    subscription(@now + 20.days, status: "canceled")
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "the e-mail gives the date, the yearly price and how to cancel" do
    sub = subscription(@now + 45.days)
    text = BillingMailer.subscription_renewal(sub).text_part.body.to_s
    assert_includes text, "Pro"
    assert_includes text, "16 juillet 2027"
    assert_includes text, "490 €"
    assert_includes text, "Formule et facturation"
  end
end
