class Session < ApplicationRecord
  # An admin signed in as this user (« Se connecter en tant que »). Such a
  # session lasts one hour at most, then the admin is back in their own.
  IMPERSONATION_TTL = 1.hour
  # A browser not seen for a year is signed out, and its IP address and user
  # agent are erased (privacy policy). Use moves `updated_at` at most daily.
  IDLE_TTL = 12.months
  SEEN_EVERY = 1.day

  belongs_to :user
  belongs_to :impersonator, class_name: "User", optional: true

  scope :idle, ->(at = Time.current) { where(updated_at: ...(at - IDLE_TTL)) }

  def self.purge_idle!(at = Time.current) = idle(at).delete_all

  def impersonation? = impersonator_id.present?

  def idle?(at = Time.current) = updated_at <= at - IDLE_TTL

  # True when this use moved the session's last-seen date (once a day).
  def seen!(at = Time.current)
    return false if readonly? || updated_at > at - SEEN_EVERY
    touch(time: at)
    true
  end

  # The signed cookie options of a browser session: it lasts as long as an
  # unused session is kept.
  def self.cookie(value) = { value:, httponly: true, same_site: :lax, expires: IDLE_TTL.from_now }

  def impersonation_ends_at = impersonation? ? created_at + IMPERSONATION_TTL : nil

  def impersonation_expired?(at = Time.current) = impersonation? && impersonation_ends_at <= at
end
