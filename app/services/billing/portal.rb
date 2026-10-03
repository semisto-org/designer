module Billing
  # Stripe customer portal: invoices, payment method, cancel or change a
  # subscription. Only for users who already have a Stripe customer.
  class Portal
    class Unavailable < StandardError; end

    def self.url(user:, return_url:, gateway: nil)
      raise Unavailable, "billing disabled" unless Billing.enabled?
      account = user.billing_account or raise Unavailable, "no Stripe customer yet"
      gateway ||= Providers::StripeGateway.new
      gateway.create_portal_session(customer: account.stripe_customer_id, return_url:, configuration: ENV["STRIPE_PORTAL_CONFIGURATION"].presence).fetch("url")
    end
  end
end
