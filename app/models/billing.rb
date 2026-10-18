# Billing entry points. Stripe is the payment processor (Semisto ASBL's
# account); while STRIPE_SECRET_KEY is absent (local dev, closed beta)
# billing is disabled and Entitlements leaves everything unlocked.
module Billing
  # The Stripe Price of each plan, by billing interval ("year" is the annual
  # option of the Pro and Team subscriptions; one-off plans have one price).
  PLAN_PRICE_ENV = {
    "yearly" => { "once" => "STRIPE_PRICE_YEARLY" },
    "atelier" => { "month" => "STRIPE_PRICE_ATELIER", "year" => "STRIPE_PRICE_ATELIER_YEARLY" },
    "bureau" => { "month" => "STRIPE_PRICE_BUREAU", "year" => "STRIPE_PRICE_BUREAU_YEARLY" },
    "drone" => { "once" => "STRIPE_PRICE_DRONE" }
  }.freeze

  # Coupons applied by Terranova itself at checkout (never typed): the Home
  # discount of Semisto members in good standing, and the launch offer on
  # annual Pro and Team subscriptions.
  COUPON_ENV = { member: "STRIPE_COUPON_MEMBER", launch: "STRIPE_COUPON_LAUNCH" }.freeze

  # A subscription whose payment failed keeps working this long, counted from
  # the first failure (Stripe retries the card meanwhile).
  PAST_DUE_GRACE = 7.days

  def self.enabled?
    ENV["STRIPE_SECRET_KEY"].present? && ENV["BILLING_DISABLED"].blank?
  end

  def self.webhook_secret = ENV["STRIPE_WEBHOOK_SECRET"].presence

  # The Stripe Price id configured for a plan key, or nil. Without an
  # interval: the plan's main price (monthly for a subscription).
  def self.price_id(plan_key, interval = nil)
    prices = PLAN_PRICE_ENV[plan_key.to_s] or return nil
    env = interval ? prices[interval.to_s] : prices.values.first
    env && ENV[env].presence
  end

  def self.coupon_id(kind) = ENV[COUPON_ENV.fetch(kind)].presence

  # Where Semisto is notified (drone orders, account deletion requests).
  def self.contact_email = ENV.fetch("SEMISTO_CONTACT_EMAIL", "designer@semisto.org")
end
