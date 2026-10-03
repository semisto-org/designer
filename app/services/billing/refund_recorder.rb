module Billing
  # charge.refunded: records the refunded amount on the payment. A pass that
  # is refunded in full stops giving access.
  class RefundRecorder
    def self.call(...) = new(...).call

    def initialize(charge, event_at:, gateway: nil)
      @charge = charge
      @event_at = event_at
      @gateway = gateway
    end

    def call
      payment = find_payment
      return "refunded payment not found" unless payment

      refunded = @charge["amount_refunded"].to_i
      payment.update!(
        refunded_cents: refunded,
        refunded_at: refunded.positive? ? (payment.refunded_at || @event_at) : nil,
        stripe_payment_intent_id: payment.stripe_payment_intent_id || Payload.id_of(@charge["payment_intent"]),
        stripe_charge_id: payment.stripe_charge_id || @charge["id"]
      )
      payment.plan_purchase.update!(status: "refunded") if payment.plan_purchase && payment.fully_refunded?
      "refund recorded"
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def find_payment
        payment_intent = Payload.id_of(@charge["payment_intent"])
        found = (payment_intent && BillingPayment.find_by(stripe_payment_intent_id: payment_intent)) ||
          BillingPayment.find_by(stripe_charge_id: @charge["id"])
        return found if found
        invoice_id = Payload.id_of(@charge["invoice"]) || (payment_intent && gateway.invoice_id_for_payment_intent(payment_intent))
        invoice_id && BillingPayment.find_by(stripe_invoice_id: invoice_id)
      end
  end
end
