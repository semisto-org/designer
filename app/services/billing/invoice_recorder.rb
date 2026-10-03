module Billing
  # invoice.paid: records the payment of a subscription invoice in the ledger,
  # or links the Stripe invoice (hosted page, PDF) to the one-off payment made
  # through Checkout (invoice_creation).
  class InvoiceRecorder
    # The invoice of a Checkout payment can arrive before the session event:
    # ask Stripe to redeliver, up to this age.
    WAIT_FOR_PAYMENT = 15.minutes

    def self.call(...) = new(...).call

    def initialize(invoice, event_at:, gateway: nil)
      @invoice = invoice
      @event_at = event_at
      @gateway = gateway
    end

    def call
      subscription_id = Payload.invoice_subscription_id(@invoice)
      subscription_id ? record_subscription_invoice(subscription_id) : link_one_time_invoice
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def record_subscription_invoice(subscription_id)
        subscription = PlanSubscription.find_by(stripe_subscription_id: subscription_id) || sync_subscription(subscription_id)
        return "unknown subscription" unless subscription

        payment = BillingPayment.find_or_initialize_by(stripe_invoice_id: @invoice["id"])
        if payment.new_record?
          payment.assign_attributes(
            user: subscription.user, plan_subscription: subscription, plan_key: subscription.plan_key,
            amount_cents: @invoice["amount_paid"].to_i,
            tax_cents: Payload.invoice_tax_cents(@invoice),
            discount_cents: Payload.invoice_discount_cents(@invoice),
            currency: @invoice["currency"].presence || "eur",
            promotion_code: PromotionCodes.new(gateway).for_invoice(@invoice),
            paid_at: Payload.time(@invoice.dig("status_transitions", "paid_at")) || @event_at,
            livemode: @invoice.fetch("livemode", true),
            stripe_customer_id: Payload.id_of(@invoice["customer"])
          )
        end
        payment.assign_attributes(hosted_invoice_url: @invoice["hosted_invoice_url"], invoice_pdf_url: @invoice["invoice_pdf"])
        payment.save!
        "subscription invoice recorded"
      end

      def sync_subscription(subscription_id)
        SubscriptionSync.call(gateway.retrieve_subscription(subscription_id), synced_at: Time.current)
        PlanSubscription.find_by(stripe_subscription_id: subscription_id)
      end

      def link_one_time_invoice
        payment = BillingPayment.find_by(stripe_invoice_id: @invoice["id"]) || matching_payment
        if payment
          payment.update!(stripe_invoice_id: @invoice["id"], hosted_invoice_url: @invoice["hosted_invoice_url"], invoice_pdf_url: @invoice["invoice_pdf"])
          "invoice linked to payment"
        elsif @event_at > WAIT_FOR_PAYMENT.ago
          raise Webhook::Retry, "payment for invoice #{@invoice['id']} not recorded yet"
        else
          "invoice without matching payment"
        end
      end

      # The Checkout payment this invoice belongs to: same customer and amount,
      # recent, not linked to an invoice yet.
      def matching_payment
        customer_id = Payload.id_of(@invoice["customer"])
        return nil unless customer_id
        BillingPayment.where(stripe_invoice_id: nil, plan_subscription_id: nil, stripe_customer_id: customer_id)
          .where(amount_cents: @invoice["amount_paid"].to_i, paid_at: 3.days.ago..)
          .order(paid_at: :desc).first
      end
  end
end
