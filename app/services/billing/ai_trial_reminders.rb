module Billing
  # Writes once to a free user whose trial of AI drafts ends within
  # AiTrial::REMIND_BEFORE, so the switch back to reading is never a
  # surprise. Safe to run every day; nobody on a plan with drafts gets it.
  class AiTrialReminders
    def self.call(now: Time.current) = new(now).call

    def initialize(now)
      @now = now
    end

    # Number of reminders sent.
    def call
      window = (@now - AiTrial::LENGTH + 1.second)..(@now - AiTrial::LENGTH + AiTrial::REMIND_BEFORE)
      User.where(ai_trial_reminded_at: nil, ai_trial_started_at: window).find_each.sum do |user|
        next 0 unless user.ai_trial_state(at: @now) == "active"
        next 0 unless User.where(id: user.id, ai_trial_reminded_at: nil).update_all(ai_trial_reminded_at: @now) == 1
        BillingMailer.ai_trial_ending(user).deliver_later
        1
      end
    end
  end
end
