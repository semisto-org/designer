# A session Sentry Session Replay recorded for someone who said yes
# (SessionReplayConsent): its id, so « Premières heures » links straight to
# it. Only each person's first SessionReplay.per_user sessions are recorded:
# the first hour is what we want to see, and Sentry's quota is small.
class SessionReplay < ApplicationRecord
  # Sentry's replay ids: a UUID without its dashes.
  ID_FORMAT = /\A\h{32}\z/

  belongs_to :user

  validates :replay_id, format: { with: ID_FORMAT }, uniqueness: { scope: :user_id }
  validates :path, length: { maximum: 500 }

  scope :oldest_first, -> { order(:created_at, :id) }

  # SENTRY_REPLAY_SESSIONS: how many sessions per person (0 turns recording off).
  def self.per_user = ENV.fetch("SENTRY_REPLAY_SESSIONS", "2").to_i

  # Recording needs Sentry in the browser (the same SENTRY_DSN, ApplicationHelper#sentry_meta_tags).
  def self.enabled? = ENV["SENTRY_DSN"].present? && per_user.positive?

  # The replay in Sentry, when SENTRY_ORG names the organisation (its slug).
  def self.url_for(replay_id)
    org = ENV["SENTRY_ORG"].presence
    org && "https://#{org}.sentry.io/replays/#{replay_id}/"
  end

  def url = self.class.url_for(replay_id)
end
