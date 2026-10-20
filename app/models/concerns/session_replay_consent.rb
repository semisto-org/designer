# Sentry Session Replay during the beta, only for people who said yes. The
# question is asked once on any page (FirstHourHost), the answer can change
# in « Mon compte », and only the first SessionReplay.per_user sessions are
# recorded. The browser asks the state on every page (shared prop
# `sessionReplay`) and follows it.
module SessionReplayConsent
  extend ActiveSupport::Concern

  included do
    has_many :session_replays, dependent: :delete_all
  end

  # "ask": not answered yet. "record": may start a session. "keep": may
  # finish the session being recorded, never start one. "off": not at all.
  def session_replay_state
    return "off" unless SessionReplay.enabled?
    return "ask" if replay_consent.nil?
    return "off" unless replay_consent
    session_replays.count < SessionReplay.per_user ? "record" : "keep"
  end

  def answer_replay_consent!(consent)
    update!(replay_consent: consent, replay_consent_at: Time.current)
  end
end
