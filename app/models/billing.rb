module Billing
  def self.enabled?
    ENV["STRIPE_SECRET_KEY"].present? && ENV["BILLING_DISABLED"].blank?
  end
end
