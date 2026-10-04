module Billing
  # Staff actions on an invoice request that must also reach Stripe when its
  # invoice was sent through Stripe:
  # - marking it paid (the transfer arrived outside Stripe): the Stripe
  #   invoice is marked « paid out of band » and the payment is recorded as
  #   the webhook would; by hand, the request is just marked paid;
  # - cancelling it: the open Stripe invoice is voided (no more reminders),
  #   and a plan already started on it stops.
  # Either way the plan starts when the request is marked paid.
  module InvoiceSettlement
    module_function

    def mark_paid(request, by:, gateway: nil)
      if through_stripe?(request)
        gateway ||= Providers::StripeGateway.new
        InvoiceRequestPayment.call(pay_out_of_band(gateway, request.stripe_invoice_id), invoice_request: request, by:)
      else
        request.mark_paid!(by:)
        request.activate!(by:)
      end
    end

    def cancel(request, by:, gateway: nil)
      (gateway || Providers::StripeGateway.new).void_invoice(request.stripe_invoice_id) if through_stripe?(request)
      request.cancel!(by:)
    end

    def through_stripe?(request)
      Billing.enabled? && request.invoiced? && request.stripe_invoice_id.present?
    end

    # Paid on Stripe in the meantime: take the paid invoice as it is.
    def pay_out_of_band(gateway, invoice_id)
      gateway.pay_invoice_out_of_band(invoice_id)
    rescue Providers::StripeGateway::Error => e
      raise unless e.message.match?(/already paid/i)
      gateway.retrieve_invoice(invoice_id)
    end
  end
end
