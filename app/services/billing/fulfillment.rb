module Billing
  # Turns a paid Checkout Session into what the customer bought: a yearly pass
  # or a drone order (PlanPurchase + BillingPayment), or a subscription
  # (synced from Stripe). Called by the webhook and, for speed, when the
  # customer comes back from Checkout; calling it twice is harmless.
  class Fulfillment
    PAID = %w[paid no_payment_required].freeze

    def self.call(...) = new(...).call

    def initialize(session, paid_at: Time.current, gateway: nil)
      @session = session
      @paid_at = paid_at
      @gateway = gateway
    end

    def call
      return "session not paid" unless PAID.include?(@session["payment_status"])
      user = Identity.user_for(@session)
      return "unknown user" unless user
      Identity.link_customer(user, Payload.id_of(@session["customer"]))

      case @session["mode"]
      when "subscription" then sync_subscription(user)
      when "payment" then record_purchase(user)
      else "ignored session mode"
      end
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def sync_subscription(user)
        subscription_id = Payload.id_of(@session["subscription"])
        return "subscription missing" unless subscription_id
        SubscriptionSync.call(gateway.retrieve_subscription(subscription_id), fallback_user: user, synced_at: Time.current)
      end

      def record_purchase(user)
        plan_key = @session.dig("metadata", "plan_key")
        return "unknown plan" unless PlanPurchase::PLAN_KEYS.include?(plan_key)
        return "purchase already recorded" if PlanPurchase.exists?(stripe_checkout_session_id: @session["id"])
        promotion_code = PromotionCodes.new(gateway).for_session(@session)

        user.with_lock do
          if PlanPurchase.exists?(stripe_checkout_session_id: @session["id"])
            "purchase already recorded"
          else
            create_purchase(user, plan_key, promotion_code)
            "#{plan_key} purchase recorded"
          end
        end
      end

      def create_purchase(user, plan_key, promotion_code)
        starts_at, expires_at = plan_key == "yearly" ? PlanPurchase.next_pass_window(user, @paid_at) : [ @paid_at, nil ]
        purchase = user.plan_purchases.create!(
          plan_key:, starts_at:, expires_at:,
          stripe_checkout_session_id: @session["id"],
          stripe_payment_intent_id: Payload.id_of(@session["payment_intent"])
        )
        user.billing_payments.create!(
          plan_purchase: purchase, plan_key:, promotion_code:, paid_at: @paid_at,
          amount_cents: @session["amount_total"].to_i,
          tax_cents: @session.dig("total_details", "amount_tax").to_i,
          discount_cents: @session.dig("total_details", "amount_discount").to_i,
          currency: @session["currency"].presence || "eur",
          livemode: @session.fetch("livemode", true),
          stripe_checkout_session_id: @session["id"],
          stripe_payment_intent_id: purchase.stripe_payment_intent_id,
          stripe_invoice_id: Payload.id_of(@session["invoice"]),
          stripe_customer_id: Payload.id_of(@session["customer"])
        )
      end
  end
end
