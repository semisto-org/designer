# Runs every day in production (config/recurring.yml): renewal reminders for
# yearly passes, the end of the AI drafts trial, the pilots' share of drone
# missions delivered a week ago without a word from the client, and the
# removal of old, already processed webhook payloads.
class BillingDailyJob < ApplicationJob
  queue_as :default

  def perform
    return unless Billing.enabled?
    Billing::RenewalReminders.call
    Billing::AiTrialReminders.call
    DroneMission.release_due_payouts!
    StripeEvent.purge_old!
  end
end
