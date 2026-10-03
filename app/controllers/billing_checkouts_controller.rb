# POST /billing/checkout — creates the Stripe Checkout Session and sends the
# customer there.
class BillingCheckoutsController < ApplicationController
  def create
    url = Billing::Checkout.call(
      user: Current.user, plan_key: params[:plan].to_s,
      success_url: "#{billing_url(checkout: 'success')}&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: billing_url(checkout: "cancelled"),
      terms_url: terms_url
    )
    leave_for url
  rescue Billing::Checkout::Unavailable => e
    redirect_to billing_path, alert: t("billing.errors.#{e.reason}"), status: :see_other
  rescue Providers::StripeGateway::Error => e
    Rails.error.report(e, handled: true)
    redirect_to billing_path, alert: t("billing.errors.stripe"), status: :see_other
  end

  private
    # Inertia visits need a client-side redirect to another site.
    def leave_for(url)
      request.inertia? ? inertia_location(url) : redirect_to(url, allow_other_host: true, status: :see_other)
    end
end
