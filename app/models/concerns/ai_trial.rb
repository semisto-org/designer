# The free plan lets Claude read one's maps; drafts belong to the paid
# plans. To try them, a user gets AiTrial::LENGTH of drafts from the first
# time they connect an assistant with drafts access (OAuth token or personal
# token), once in a lifetime. Then the account falls back to reading.
# Nothing starts while billing is off (beta: everything is open anyway).
module AiTrial
  extend ActiveSupport::Concern

  LENGTH = 14.days
  REMIND_BEFORE = 3.days

  def ai_trial_ends_at
    ai_trial_started_at && ai_trial_started_at + LENGTH
  end

  def ai_trial_active?(at: Time.current)
    ai_trial_ends_at.present? && at < ai_trial_ends_at
  end

  # Called whenever an assistant gets a token with drafts access: only the
  # first call counts, and it is atomic so two parallel connections cannot
  # move the start date.
  def start_ai_trial!(at: Time.current)
    return false unless Billing.enabled? && ai_trial_started_at.nil?
    started = self.class.where(id:, ai_trial_started_at: nil).update_all(ai_trial_started_at: at, updated_at: at) == 1
    if started
      reload
      @entitlements = nil
    end
    started
  end

  # What the user should be told: "available" (never started, plan without
  # drafts), "active", "ended", or nil when the trial does not matter (paid
  # plan, or billing off).
  def ai_trial_state(at: Time.current)
    return nil if !Billing.enabled? || Entitlements::PLANS.fetch(current_plan_key(at:))[:ai_drafts]
    return "available" if ai_trial_started_at.nil?
    ai_trial_active?(at:) ? "active" : "ended"
  end

  def ai_trial_as_json(at: Time.current)
    state = ai_trial_state(at:)
    return nil unless state
    # Before it starts: the end date it would have if it started now.
    ends_at = ai_trial_ends_at || at + LENGTH
    {
      state:, days: LENGTH.in_days.to_i,
      endsAt: ends_at&.iso8601,
      daysLeft: state == "active" ? ((ends_at - at) / 1.day).ceil : nil
    }
  end
end
