# Billing entry points. Stripe is the payment processor (account of Marco &
# Vespucci); while STRIPE_SECRET_KEY is absent (local dev, closed beta)
# billing is disabled and Entitlements leaves everything unlocked.
module Billing
  PLAN_PRICE_ENV = {
    "yearly" => "STRIPE_PRICE_YEARLY",
    "atelier" => "STRIPE_PRICE_ATELIER",
    "bureau" => "STRIPE_PRICE_BUREAU",
    "drone" => "STRIPE_PRICE_DRONE"
  }.freeze

  # A subscription whose payment failed keeps working this long, counted from
  # the first failure (Stripe retries the card meanwhile).
  PAST_DUE_GRACE = 7.days

  def self.enabled?
    ENV["STRIPE_SECRET_KEY"].present? && ENV["BILLING_DISABLED"].blank?
  end

  def self.webhook_secret = ENV["STRIPE_WEBHOOK_SECRET"].presence

  # The Stripe Price id configured for a plan key, or nil.
  def self.price_id(plan_key)
    env = PLAN_PRICE_ENV[plan_key.to_s]
    env && ENV[env].presence
  end

  # Where Semisto is notified (drone orders, account deletion requests).
  def self.contact_email = ENV.fetch("SEMISTO_CONTACT_EMAIL", "designer@semisto.org")
end
