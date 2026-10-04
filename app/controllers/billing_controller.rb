# /billing — the current plan, its expiry, and how to buy, renew or upgrade.
class BillingController < ApplicationController
  CHECKOUT_RESULTS = %w[success cancelled].freeze

  def show
    fulfill_returning_session if Billing.enabled? && params[:session_id].present?
    render inertia: "billing/show", props: { billing: billing_props(Current.user) }
  end

  private
    # The customer is back from Checkout: do not wait for the webhook.
    def fulfill_returning_session
      session = Providers::StripeGateway.new.retrieve_checkout_session(params[:session_id].to_s)
      return unless Billing::Identity.user_for(session) == Current.user
      Billing::Fulfillment.call(session)
    rescue StandardError => e
      Rails.error.report(e, handled: true, severity: :warning)
    end

    def billing_props(user)
      at = Time.current
      pass = user.current_yearly_pass(at:)
      expired = user.last_expired_pass(at:)
      subscription = user.latest_plan_subscription
      {
        enabled: Billing.enabled?,
        plan: user.current_plan_key(at:),
        pass: pass && pass_json(pass, at),
        expiredPass: expired && pass_json(expired, at),
        subscription: subscription && subscription_json(subscription),
        ownedMaps: user.owned_maps.active.count,
        maxMaps: user.entitlements.max_maps,
        readOnlyMaps: user.read_only_maps_count,
        drone: user.plan_purchases.drone.paid.newest_first.limit(5).map { |p| { paidAt: p.starts_at.iso8601 } },
        canManage: user.billing_account.present?,
        payments: user.billing_payments.newest_first.limit(12).map { |payment| payment_json(payment) },
        grants: user.plan_grants.current_or_upcoming(at).order(:starts_at).limit(3).map { |grant| grant.as_json_for_billing(at) },
        invoiceRequests: user.invoice_requests.newest_first.limit(5).map(&:as_member_json),
        catalog: Billing::Catalog.as_json,
        memberPriceCents: Billing::Catalog.member_price_cents,
        checkout: CHECKOUT_RESULTS.include?(params[:checkout]) ? params[:checkout] : nil,
        highlight: Billing::Catalog.find(params[:plan])&.key
      }
    end

    def pass_json(purchase, at)
      {
        planKey: purchase.plan_key,
        startsAt: purchase.starts_at.iso8601,
        expiresAt: purchase.expires_at.iso8601,
        daysLeft: purchase.days_left(at)
      }
    end

    def subscription_json(subscription)
      {
        planKey: subscription.plan_key,
        status: subscription.status,
        active: subscription.grants_access?,
        currentPeriodEnd: subscription.current_period_end&.iso8601,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        pastDue: subscription.past_due?
      }
    end

    def payment_json(payment)
      {
        id: payment.id, planKey: payment.plan_key, paidAt: payment.paid_at.iso8601,
        amountCents: payment.amount_cents, currency: payment.currency,
        refundedCents: payment.refunded_cents, invoiceUrl: payment.hosted_invoice_url
      }
    end
end
