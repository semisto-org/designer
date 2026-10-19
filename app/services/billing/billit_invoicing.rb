module Billing
  # The legal invoice of a sale to a Belgian business: made in Billit and sent
  # over Peppol, the Belgian e-invoicing network (or by e-mail, through Billit,
  # when the customer is not on Peppol yet). Billit numbers it in Semisto's own
  # series; the Stripe invoice stays the payment receipt. A refund gets a
  # credit note, for the newly refunded amount.
  #
  # Who gets one: the Stripe invoice carries a Belgian VAT number (given at
  # Checkout or in « Mon compte ») and Belgian VAT. Private persons and
  # businesses in other countries keep the Stripe invoice. Payments of an
  # invoice sent to a commune or a company (InvoiceRequest) are left out: that
  # Stripe invoice was already issued before the payment.
  #
  # Live Stripe payments go to Billit's production and test payments to its
  # sandbox, never across. Every step can be run again: a document already in
  # Billit is found by its external reference before anything is created.
  class BillitInvoicing
    PAYMENT_METHOD = "Online".freeze
    DELIVERED = "Delivered".freeze
    REFUSED = %w[Error Refused].freeze

    def initialize(billit: Providers::Billit.new, gateway: nil)
      @billit = billit
      @gateway = gateway
    end

    def applicable?(payment)
      @billit.configured? && payment.stripe_invoice_id.present? && payment.invoice_request_id.nil? &&
        payment.amount_cents.positive? && payment.livemode == @billit.production?
    end

    # The invoice document of the payment, made and sent if needed; nil when
    # the payment is not for Billit.
    def invoice(payment)
      return nil unless applicable?(payment)
      document = payment.billit_documents.invoices.first
      return document if document && !document.status.in?(%w[pending created])

      stripe_invoice = gateway.retrieve_invoice(payment.stripe_invoice_id)
      document ||= new_invoice_document(payment, stripe_invoice)
      return document if document.status == "skipped"
      deliver(document) { invoice_payload(payment, stripe_invoice, document) }
    end

    # Credit notes for what was refunded since the last one (after retrying
    # those that failed).
    def credit(payment)
      return [] unless applicable?(payment)
      invoice = payment.billit_documents.invoices.first
      return [] unless invoice&.in_billit?

      stripe_invoice = nil
      documents = payment.billit_documents.credit_notes.retryable.to_a
      refunded = [ payment.refunded_cents, payment.amount_cents ].min
      remaining = refunded - payment.billit_documents.credit_notes.sum(:amount_cents)
      if remaining.positive?
        documents << payment.billit_documents.create!(
          kind: "credit_note", idempotency_key: "terranova-cn-#{payment.stripe_invoice_id}-#{refunded}",
          amount_cents: remaining, tax_cents: (remaining * payment.tax_cents.to_r / payment.amount_cents).round,
          customer_vat_number: invoice.customer_vat_number
        )
      end
      documents.map do |document|
        deliver(document) do
          stripe_invoice ||= gateway.retrieve_invoice(payment.stripe_invoice_id)
          credit_note_payload(payment, stripe_invoice, document, invoice)
        end
      end
    end

    # Reads where a sent document is: delivered, or refused (reported to Sentry).
    def refresh(document)
      return document unless document.status == "sent" && document.billit_order_id
      details = @billit.order(document.billit_order_id)["CurrentDocumentDeliveryDetails"] || {}
      status = details["DocumentDeliveryStatus"]
      if status == DELIVERED
        document.update!(status: "delivered", delivered_at: parse_time(details["DocumentDeliveryDate"]) || Time.current)
      elsif REFUSED.include?(status)
        reason = [ status, details["DocumentRefusedReasonTC"], details["DocumentRefusedInfo"] ].compact_blank.join(" — ")
        document.update!(status: "refused", last_error: reason)
        Rails.error.report(Providers::Billit::Error.new("Billit document #{document.order_number} refused: #{reason}"),
          handled: true, context: { billit_document_id: document.id })
      end
      document
    rescue Providers::Billit::Error => e
      Rails.error.report(e, handled: true, context: { billit_document_id: document.id })
      document
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def new_invoice_document(payment, stripe_invoice)
        vat = belgian_vat_number(stripe_invoice)
        payment.billit_documents.create!(
          kind: "invoice", idempotency_key: "terranova-#{payment.stripe_invoice_id}",
          status: vat && payment.tax_cents.positive? ? "pending" : "skipped",
          amount_cents: payment.amount_cents, tax_cents: payment.tax_cents, customer_vat_number: vat
        )
      end

      # The customer's Belgian VAT number on the Stripe invoice, if any.
      def belgian_vat_number(stripe_invoice)
        return nil unless stripe_invoice.dig("customer_address", "country") == "BE"
        Array(stripe_invoice["customer_tax_ids"])
          .find { |tax_id| tax_id["type"] == "eu_vat" && tax_id["value"].to_s.upcase.start_with?("BE") }
          &.dig("value")&.upcase&.delete("^A-Z0-9")
      end

      # Creates the document in Billit (or finds the one a lost response
      # already created), then sends it. A failure is kept on the document,
      # reported, and tried again by the next run.
      def deliver(document)
        unless document.billit_order_id
          id = existing_order_id(document) || create_order(document, yield)
          order = @billit.order(id)
          document.update!(billit_order_id: id, order_number: order["OrderNumber"], status: "created", last_error: nil)
        end
        if document.status == "created"
          transport = @billit.peppol_receiver?(document.customer_vat_number) ? "Peppol" : "SMTP"
          @billit.send_orders([ document.billit_order_id ], transport:)
          document.update!(status: "sent", transport:, sent_at: Time.current, last_error: nil)
        end
        document
      rescue Providers::Billit::Error, Providers::StripeGateway::Error => e
        document.update_columns(last_error: e.message.truncate(1_000), attempts: document.attempts + 1, updated_at: Time.current)
        Rails.error.report(e, handled: true, context: { billit_document_id: document.id })
        document
      end

      def existing_order_id(document) = @billit.find_by_external_id(document.idempotency_key)&.dig("OrderID")

      def create_order(document, payload)
        @billit.create_order(payload, idempotency_key: document.idempotency_key)
      rescue Providers::Billit::Error => e
        raise unless e.duplicate?
        existing_order_id(document) or raise
      end

      def invoice_payload(payment, stripe_invoice, document)
        common_payload(payment, stripe_invoice, document, date: payment.paid_at).merge(
          OrderType: "Invoice",
          Paid: true, PaidDate: "#{local_date(payment.paid_at).iso8601}T00:00:00", PaymentMethod: PAYMENT_METHOD,
          Comments: I18n.t("billing.billit.paid", date: FrenchDate.long(payment.paid_at), reference: stripe_reference(payment, stripe_invoice))
        )
      end

      def credit_note_payload(payment, stripe_invoice, document, invoice)
        common_payload(payment, stripe_invoice, document, date: document.created_at).merge(
          OrderType: "CreditNote", AboutInvoiceNumber: invoice.order_number,
          Comments: I18n.t("billing.billit.refund", date: FrenchDate.long(document.created_at), invoice: invoice.order_number)
        )
      end

      # VAT-inclusive amounts, as Stripe charged them, with the VAT group
      # given so Billit's totals match Stripe's to the cent.
      def common_payload(payment, stripe_invoice, document, date:)
        total = euros(document.amount_cents)
        tax = euros(document.tax_cents)
        rate = (document.tax_cents * 100.0 / (document.amount_cents - document.tax_cents)).round
        day = local_date(date).iso8601
        {
          OrderDirection: "Income", OrderDate: day, ExpiryDate: day, Currency: payment.currency.upcase,
          ExternalProviderID: document.idempotency_key,
          InternalInfo: "Stripe #{stripe_reference(payment, stripe_invoice)}",
          Customer: customer(payment, stripe_invoice, document.customer_vat_number),
          OrderLines: [ { Quantity: 1, Description: line_description(payment), DescriptionExtended: period(payment, stripe_invoice),
                          InclLeading: true, TotalIncl: total, VATPercentage: rate }.compact ],
          VatGroups: [ { VATPercentage: rate, TotalExcl: euros(document.amount_cents - document.tax_cents), TotalVAT: tax, TotalIncl: total } ]
        }
      end

      def customer(payment, stripe_invoice, vat_number)
        address = stripe_invoice["customer_address"] || {}
        name = stripe_invoice["customer_name"].presence || payment.user.name
        {
          Name: name, VATNumber: vat_number, PartyType: "Customer", Language: "FR", Nr: "TN-#{payment.user_id}",
          Email: stripe_invoice["customer_email"].presence || payment.user.email_address,
          Addresses: [ {
            AddressType: "InvoiceAddress", Name: name,
            Street: [ address["line1"], address["line2"] ].compact_blank.join(", "),
            Zipcode: address["postal_code"], City: address["city"], CountryCode: address["country"]
          } ]
        }
      end

      def line_description(payment)
        plan = I18n.t("billing.plans.#{payment.plan_key}.name", default: payment.plan_key)
        I18n.t(payment.plan_key == "drone" ? "billing.billit.drone_line" : "billing.billit.line", plan:)
      end

      # The period a subscription invoice or a yearly pass covers, or nil.
      def period(payment, stripe_invoice)
        from, to =
          if (purchase = payment.plan_purchase)&.expires_at
            [ purchase.starts_at, purchase.expires_at ]
          elsif (line_period = Array(stripe_invoice.dig("lines", "data")).first&.dig("period"))
            [ Payload.time(line_period["start"]), Payload.time(line_period["end"]) ]
          end
        return nil unless from && to && to > from
        I18n.t("billing.billit.period", from: FrenchDate.long(from), to: FrenchDate.long(to))
      end

      def stripe_reference(payment, stripe_invoice) = stripe_invoice["number"].presence || payment.stripe_invoice_id

      def local_date(time) = time.in_time_zone.to_date
      def euros(cents) = (cents / 100.0).round(2)

      def parse_time(value)
        value.present? ? Time.zone.parse(value) : nil
      rescue ArgumentError
        nil
      end
  end
end
