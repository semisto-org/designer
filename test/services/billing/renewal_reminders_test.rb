require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::RenewalRemindersTest < ActiveSupport::TestCase
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @user = users(:bob)
    @now = Time.zone.local(2027, 6, 1, 8, 0)   # no DST change in the next two months
  end

  def pass(expires_at, user: @user)
    user.plan_purchases.create!(plan_key: "yearly", starts_at: expires_at - 1.year, expires_at:, stripe_checkout_session_id: "cs_#{SecureRandom.hex(4)}")
  end

  def run_reminders(at = @now) = Billing::RenewalReminders.call(now: at)

  test "nothing to send more than 30 days before expiry" do
    pass(@now + 31.days)
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "sends the 30-day reminder once, however often the job runs" do
    purchase = pass(@now + 29.days)
    assert_enqueued_emails 1 do
      assert_equal 1, run_reminders
      assert_equal 0, run_reminders(@now + 1.hour)
      assert_equal 0, run_reminders(@now + 3.days)
    end
    assert_equal %w[d30], purchase.billing_notices.pluck(:kind)
  end

  test "then the 7-day reminder, then the expiry notice: three mails over the life of a pass" do
    purchase = pass(@now + 30.days)
    assert_enqueued_emails 3 do
      assert_equal 1, run_reminders(@now)                        # d30
      assert_equal 0, run_reminders(@now + 10.days)
      assert_equal 1, run_reminders(@now + 23.days + 1.hour)     # d7
      assert_equal 0, run_reminders(@now + 25.days)
      assert_equal 1, run_reminders(@now + 30.days + 1.hour)     # expired
      assert_equal 0, run_reminders(@now + 31.days)
    end
    assert_equal %w[d30 d7 expired], purchase.billing_notices.order(:sent_at).pluck(:kind)
  end

  test "a job that missed days sends only the reminder that is due now" do
    purchase = pass(@now + 5.days)
    assert_enqueued_emails(1) { run_reminders }
    assert_equal %w[d7], purchase.billing_notices.pluck(:kind)
  end

  test "the expiry notice is not sent long after the fact" do
    pass(@now - 20.days)
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "no reminder once the pass was renewed" do
    pass(@now + 5.days)
    pass(@now + 5.days + 1.year)
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "no reminder for a user on a subscription, a refunded pass or a drone order" do
    pass(@now + 5.days, user: users(:alice)).update!(status: "refunded")
    @user.plan_subscriptions.create!(plan_key: "atelier", status: "active", stripe_subscription_id: "sub_1")
    pass(@now + 5.days)
    @user.plan_purchases.create!(plan_key: "drone", starts_at: @now, stripe_checkout_session_id: "cs_drone")
    assert_no_enqueued_emails { assert_equal 0, run_reminders }
  end

  test "the e-mail says when the pass ends and links to the renewal" do
    purchase = pass(Time.zone.local(2027, 10, 12, 12, 0))
    mail = BillingMailer.renewal_reminder(purchase, "d30")
    assert_equal [ @user.email_address ], mail.to
    assert_equal "Votre forfait Semisto Designer se termine le 12 octobre 2027", mail.subject
    text = mail.text_part.body.to_s
    assert_includes text, "12 octobre 2027"
    assert_includes text, "Rien n'est prélevé automatiquement"
    assert_includes text, "/billing?plan=yearly"
    assert_includes mail.html_part.body.to_s, "Renouveler mon forfait"
  end

  test "the 7-day and expired e-mails have their own wording" do
    purchase = pass(Time.zone.local(2027, 10, 12, 12, 0))
    assert_match "Plus que 7 jours", BillingMailer.renewal_reminder(purchase, "d7").subject
    with_billing do
      Map.create!(name: "A", owner: @user, region: regions(:wallonia), created_at: 3.months.ago)
      Map.create!(name: "B", owner: @user, region: regions(:wallonia), created_at: 2.months.ago)
      travel_to Time.zone.local(2027, 10, 13) do
        mail = BillingMailer.renewal_reminder(purchase, "expired")
        assert_equal "Votre forfait Semisto Designer est arrivé à échéance", mail.subject
        assert_includes mail.text_part.body.to_s, "1 de vos cartes est désormais en lecture seule"
        assert_includes mail.text_part.body.to_s, "rien n'est jamais supprimé"
      end
    end
  end

  test "the daily job runs the reminders only when billing is configured" do
    pass(@now + 5.days)
    travel_to @now do
      assert_no_enqueued_emails { BillingDailyJob.perform_now }
      with_billing do
        assert_enqueued_emails(1) { BillingDailyJob.perform_now }
      end
    end
  end

  test "the daily job purges old processed webhook payloads" do
    old = StripeEvent.create!(stripe_event_id: "evt_old", event_type: "x", processed_at: 100.days.ago)
    recent = StripeEvent.create!(stripe_event_id: "evt_new", event_type: "x", processed_at: 1.day.ago)
    failed = StripeEvent.create!(stripe_event_id: "evt_failed", event_type: "x", error: "boom", created_at: 100.days.ago)
    with_billing { BillingDailyJob.perform_now }
    assert_not StripeEvent.exists?(old.id)
    assert StripeEvent.exists?(recent.id)
    assert StripeEvent.exists?(failed.id), "unprocessed events are kept for investigation"
  end
end
