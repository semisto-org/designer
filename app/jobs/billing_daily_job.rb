# Runs every day in production (config/recurring.yml): renewal reminders for
# yearly passes, the end of the AI drafts trial, and the removal of old, already processed webhook payloads.
class BillingDailyJob < ApplicationJob
  queue_as :default

  def perform
    return unless Billing.enabled?
    Billing::RenewalReminders.call
    Billing::AiTrialReminders.call
    StripeEvent.purge_old!
  end
end
