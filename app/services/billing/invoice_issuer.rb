module Billing
  # « Créer la facture dans Stripe »: sends the invoice of an InvoiceRequest
  # with Stripe Invoicing. The invoice goes to a Stripe customer of its own
  # for the organisation (name, address, billing e-mail, EU VAT number as a
  # tax id), never to the user's personal customer: a commune's address must
  # not end up on the receipts of a pass the same person buys for themself.
  # A later request of the same user for the same organisation (a renewal)
  # reuses that customer.
  # The invoice is due in 30 days (bank transfer or its payment page), shows
  # the purchase-order number, and carries the request id in its metadata so
  # that invoice.paid finds the request (InvoiceRequestPayment).
  #
  # Resumable: the draft's id is saved as soon as it exists, so a retry after
  # a Stripe failure finishes that invoice instead of starting a second one.
  class InvoiceIssuer
    # reason: :not_configured, :not_requested
    class Unavailable < StandardError
      attr_reader :reason

      def initialize(reason)
        @reason = reason
        super(reason.to_s)
      end
    end

    DAYS_UNTIL_DUE = 30

    def self.call(...) = new(...).call

    def initialize(invoice_request, by: nil, gateway: nil)
      @request = invoice_request
      @user = invoice_request.user
      @by = by
      @gateway = gateway
    end

    # The finalized and sent Stripe invoice.
    def call
      raise Unavailable.new(:not_configured) unless Billing.enabled?
      raise Unavailable.new(:not_requested) unless @request.requested?

      customer_id = customer
      tax_id_attached = attach_tax_id(customer_id)
      invoice = resumable_draft || create_draft(customer_id, tax_id_attached)
      add_line(customer_id, invoice["id"]) if invoice["status"] == "draft" && Array(invoice.dig("lines", "data")).empty?
      invoice = gateway.finalize_invoice(invoice["id"]) if invoice["status"] == "draft"
      invoice = gateway.send_invoice(invoice["id"]) if invoice["status"] == "open"
      @request.record_invoice!(invoice, by: @by)
      invoice
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      # A customer saved with test keys does not exist with live keys: create a new one once.
      def customer
        attempts = 0
        begin
          upsert_customer(reuse: attempts.zero?)
        rescue Providers::StripeGateway::Error => e
          raise unless e.message.match?(/no such customer/i) && (attempts += 1) == 1
          @request.update!(stripe_customer_id: nil)
          retry
        end
      end

      def upsert_customer(reuse:)
        if (customer_id = @request.stripe_customer_id || (reuse && earlier_customer_id))
          gateway.update_customer(customer_id, customer_fields)
        else
          fields = customer_fields
          customer_id = gateway.create_customer(email: fields.delete(:email), name: fields.delete(:name), metadata: { user_id: @user.id.to_s, invoice_request_id: @request.id.to_s }, **fields).fetch("id")
        end
        @request.update!(stripe_customer_id: customer_id)
        customer_id
      end

      # The customer of an earlier invoice of this user to the same organisation.
      def earlier_customer_id
        @user.invoice_requests.where.not(id: @request.id).where.not(stripe_customer_id: nil)
          .where(organization_name: @request.organization_name, company_number: @request.company_number)
          .newest_first.pick(:stripe_customer_id)
      end

      def customer_fields
        { name: @request.organization_name, email: @request.billing_email, address: @request.stripe_address, preferred_locales: [ "fr" ] }
      end

      # True when the EU VAT number is on the customer (printed on the invoice).
      # A number Stripe refuses is printed as a custom field instead.
      def attach_tax_id(customer_id)
        vat = @request.eu_vat_number or return false
        known = Array(gateway.list_tax_ids(customer_id)["data"]).any? do |tax_id|
          tax_id["type"] == "eu_vat" && tax_id["value"].to_s.upcase.gsub(/[^0-9A-Z]/, "") == vat
        end
        gateway.create_tax_id(customer_id, type: "eu_vat", value: vat) unless known
        true
      rescue Providers::StripeGateway::Error => e
        Rails.error.report(e, handled: true, severity: :warning)
        false
      end

      # The draft (or open invoice) of an earlier attempt that stopped half-way.
      def resumable_draft
        return nil if @request.stripe_invoice_id.blank?
        invoice = gateway.retrieve_invoice(@request.stripe_invoice_id)
        %w[draft open].include?(invoice["status"]) ? invoice : nil
      end

      def create_draft(customer_id, tax_id_attached)
        invoice = gateway.create_invoice({
          customer: customer_id,
          currency: @request.currency,
          collection_method: "send_invoice",
          days_until_due: DAYS_UNTIL_DUE,
          auto_advance: false,
          automatic_tax: { enabled: true },
          pending_invoice_items_behavior: "exclude",
          custom_fields: custom_fields(tax_id_attached).presence,
          metadata:
        }.compact)
        @request.update!(stripe_invoice_id: invoice.fetch("id"))
        invoice
      end

      # VAT included, like every price of the catalogue.
      def add_line(customer_id, invoice_id)
        gateway.create_invoice_item(
          customer: customer_id,
          invoice: invoice_id,
          amount: @request.amount_cents,
          currency: @request.currency,
          tax_behavior: "inclusive",
          description: I18n.t("invoicing.stripe.line", plan: @request.plan_name, months: @request.duration_months),
          metadata:
        )
      end

      def custom_fields(tax_id_attached)
        fields = []
        fields << { name: I18n.t("invoicing.stripe.purchase_order"), value: @request.purchase_order } if @request.purchase_order
        if @request.company_number && !tax_id_attached
          fields << { name: I18n.t("invoicing.stripe.company_number"), value: @request.company_number.truncate(140) }
        end
        fields
      end

      def metadata
        { invoice_request_id: @request.id.to_s, user_id: @user.id.to_s, plan_key: @request.plan_key }
      end
  end
end
