class Session < ApplicationRecord
  # An admin signed in as this user (« Se connecter en tant que »). Such a
  # session lasts one hour at most, then the admin is back in their own.
  IMPERSONATION_TTL = 1.hour

  belongs_to :user
  belongs_to :impersonator, class_name: "User", optional: true

  def impersonation? = impersonator_id.present?

  def impersonation_ends_at = impersonation? ? created_at + IMPERSONATION_TTL : nil

  def impersonation_expired?(at = Time.current) = impersonation? && impersonation_ends_at <= at
end
