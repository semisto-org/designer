require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::AiTrialRemindersTest < ActiveSupport::TestCase
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @user = users(:bob)
    @start = Time.zone.local(2027, 6, 1, 8, 0)
    @user.update!(ai_trial_started_at: @start)
  end

  def run_reminders(at) = with_billing { Billing::AiTrialReminders.call(now: at) }

  test "writes once, three days before the end of the trial" do
    assert_no_enqueued_emails { assert_equal 0, run_reminders(@start + 10.days) }
    assert_enqueued_emails 1 do
      assert_equal 1, run_reminders(@start + 11.days + 1.hour)
      assert_equal 0, run_reminders(@start + 12.days)
    end
    assert_equal @start + 11.days + 1.hour, @user.reload.ai_trial_reminded_at
  end

  test "nothing once the trial is over, nor for a paid plan" do
    assert_no_enqueued_emails { assert_equal 0, run_reminders(@start + 15.days) }
    @user.plan_purchases.create!(plan_key: "yearly", starts_at: @start, expires_at: @start + 1.year, stripe_checkout_session_id: "cs_rem")
    assert_no_enqueued_emails { assert_equal 0, run_reminders(@start + 12.days) }
  end

  test "the e-mail gives the end date and says nothing disappears" do
    mail = BillingMailer.ai_trial_ending(@user)
    assert_equal "Ton essai des brouillons de ton IA se termine le 15 juin 2027", mail.subject
    assert_match "rien ne disparaît", mail.text_part.body.to_s
    assert_match "/billing", mail.html_part.body.to_s
    assert_match "/account/ai", mail.text_part.body.to_s
  end
end
