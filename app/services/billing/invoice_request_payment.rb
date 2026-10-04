module Billing
  # The invoice of an InvoiceRequest is paid (invoice.paid, or staff marked
  # it paid outside Stripe): the payment lands in the ledger once (unique
  # Stripe invoice id), the request is marked paid, and its plan starts if
  # staff did not start it already. Calling it again changes nothing.
  class InvoiceRequestPayment
    # The request an invoice was made for: our metadata first, then the
    # invoice id saved on the request.
    def self.request_for(invoice)
      id = invoice.dig("metadata", "invoice_request_id").presence
      (id && InvoiceRequest.find_by(id:)) || (invoice["id"].present? && InvoiceRequest.find_by(stripe_invoice_id: invoice["id"])) || nil
    end

    def self.call(...) = new(...).call

    def initialize(invoice, invoice_request:, event_at: Time.current, by: nil)
      @invoice = invoice
      @request = invoice_request
      @event_at = event_at
      @by = by
    end

    def call
      paid_at = Payload.time(@invoice.dig("status_transitions", "paid_at")) || @event_at
      @request.with_lock do
        record_payment(paid_at)
        @request.update!(hosted_invoice_url: @invoice["hosted_invoice_url"] || @request.hosted_invoice_url,
                         invoice_pdf_url: @invoice["invoice_pdf"] || @request.invoice_pdf_url)
        @request.mark_paid!(at: paid_at, by: @by)
      end
      @request.activate!(by: @by)
      "invoice request payment recorded"
    end

    private
      def record_payment(paid_at)
        payment = BillingPayment.find_or_initialize_by(stripe_invoice_id: @invoice.fetch("id"))
        if payment.new_record?
          payment.assign_attributes(
            user: @request.user, invoice_request: @request, plan_key: @request.plan_key,
            amount_cents: amount_cents,
            tax_cents: Payload.invoice_tax_cents(@invoice),
            discount_cents: Payload.invoice_discount_cents(@invoice),
            currency: @invoice["currency"].presence || @request.currency,
            paid_at:,
            livemode: @invoice.fetch("livemode", true),
            stripe_customer_id: Payload.id_of(@invoice["customer"])
          )
        end
        payment.assign_attributes(hosted_invoice_url: @invoice["hosted_invoice_url"], invoice_pdf_url: @invoice["invoice_pdf"])
        payment.save!
      end

      # An invoice marked paid outside Stripe may report nothing in amount_paid.
      def amount_cents
        paid = @invoice["amount_paid"].to_i
        paid.positive? ? paid : @invoice["total"].to_i
      end
  end
end
