# POST /billing/portal — Stripe customer portal (invoices, payment method,
# cancel or change a subscription).
class BillingPortalsController < ApplicationController
  def create
    url = Billing::Portal.url(user: Current.user, return_url: billing_url)
    request.inertia? ? inertia_location(url) : redirect_to(url, allow_other_host: true, status: :see_other)
  rescue Billing::Portal::Unavailable
    redirect_to billing_path, alert: t("billing.errors.no_portal"), status: :see_other
  rescue Providers::StripeGateway::Error => e
    Rails.error.report(e, handled: true)
    redirect_to billing_path, alert: t("billing.errors.stripe"), status: :see_other
  end
end
