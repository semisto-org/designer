require "test_helper"
require_relative "../../test_helpers/billing_test_helper"
require_relative "../../test_helpers/teams_test_helper"

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

  # « Je fais partie de l'équipe Semisto » (Eric, 2026-11-23): its maps follow
  # the team's plan, so the end of a member's own trial changes nothing there.
  test "a member of a team that pays for drafts, with no map outside it, is not written to" do
    payer = make_user("Semisto")
    payer.plan_subscriptions.create!(plan_key: "bureau", status: "active", stripe_subscription_id: "sub_team_trial")
    team = make_team("Semisto", admin: payer, members: [ @user ])
    team.update!(billing_user: payer)
    @user.owned_maps.where(organization_id: nil).find_each { |map| map.update_columns(organization_id: team.id) }
    @user.owned_maps.create!(name: "Torgny", organization: team)

    with_billing do
      assert_equal [ "Semisto" ], @user.ai_drafts_teams.map(&:name)
      assert_not @user.ai_trial_matters?
      assert_equal [ "Semisto" ], @user.ai_trial_as_json[:coveredTeams]
    end
    assert_no_enqueued_emails { assert_equal 0, run_reminders(@start + 11.days + 1.hour) }
    assert_nil @user.reload.ai_trial_reminded_at

    # A map of their own, outside the team: the trial matters there, and the
    # e-mail says the team's maps keep their drafts.
    @user.owned_maps.create!(name: "Mon jardin")
    assert_enqueued_emails 1 do
      assert_equal 1, run_reminders(@start + 11.days + 2.hours)
    end
    mail = with_billing { BillingMailer.ai_trial_ending(@user) }
    assert_match "Sur les cartes de l'équipe Semisto, rien ne change", mail.text_part.body.to_s
    assert_match "Sur les cartes de l'équipe Semisto, rien ne change", mail.html_part.body.to_s.gsub("&#39;", "'")
  end

  test "a team nobody pays for changes nothing to the reminder" do
    make_team("Collectif", admin: users(:alice), members: [ @user ])
    with_billing { assert_empty @user.ai_drafts_teams }
    assert_enqueued_emails 1 do
      assert_equal 1, run_reminders(@start + 11.days + 1.hour)
    end
  end
end
