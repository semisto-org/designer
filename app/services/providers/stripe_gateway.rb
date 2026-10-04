module Providers
  # Everything we ask Stripe, behind a small stable interface (Checkout,
  # customer portal, invoices sent to communes and companies, lookups used
  # while processing webhooks). Responses are
  # plain string-keyed hashes, whatever the Stripe API version. Any Stripe or
  # network failure becomes Providers::StripeGateway::Error, so callers show a
  # French message instead of crashing.
  class StripeGateway
    class Error < StandardError; end
    class NotConfigured < Error; end

    SESSION_EXPAND = %w[total_details.breakdown].freeze

    def self.configured? = Billing.enabled?

    def initialize(api_key: ENV["STRIPE_SECRET_KEY"])
      raise NotConfigured, "STRIPE_SECRET_KEY is not set" if api_key.blank?
      @client = Stripe::StripeClient.new(api_key)
    end

    # extra: address, preferred_locales… (Stripe customer fields).
    def create_customer(email:, name: nil, metadata: {}, **extra)
      call { @client.v1.customers.create({ email:, name:, metadata:, **extra }.compact) }
    end

    def update_customer(id, params)
      call { @client.v1.customers.update(id, params) }
    end

    def list_tax_ids(customer)
      call { @client.v1.customers.tax_ids.list(customer, { limit: 100 }) }
    end

    # type: "eu_vat", value: "BE0123456789".
    def create_tax_id(customer, type:, value:)
      call { @client.v1.customers.tax_ids.create(customer, { type:, value: }) }
    end

    # --- Invoices sent by e-mail and paid by transfer (InvoiceRequest) ---

    def create_invoice(params)
      call { @client.v1.invoices.create(params) }
    end

    def create_invoice_item(params)
      call { @client.v1.invoice_items.create(params) }
    end

    def finalize_invoice(id)
      call { @client.v1.invoices.finalize_invoice(id, { auto_advance: false }) }
    end

    # E-mails the invoice (with its payment page link) to the customer.
    def send_invoice(id)
      call { @client.v1.invoices.send_invoice(id) }
    end

    # The transfer arrived outside Stripe: the invoice is marked paid, no charge.
    def pay_invoice_out_of_band(id)
      call { @client.v1.invoices.pay(id, { paid_out_of_band: true }) }
    end

    def void_invoice(id)
      call { @client.v1.invoices.void_invoice(id) }
    end

    def create_checkout_session(params)
      call { @client.v1.checkout.sessions.create(params) }
    end

    def create_portal_session(customer:, return_url:, configuration: nil)
      call { @client.v1.billing_portal.sessions.create({ customer:, return_url:, configuration: }.compact) }
    end

    # The discount breakdown is only returned when expanded.
    def retrieve_checkout_session(id)
      call { @client.v1.checkout.sessions.retrieve(id, { expand: SESSION_EXPAND }) }
    end

    def retrieve_subscription(id)
      call { @client.v1.subscriptions.retrieve(id) }
    end

    # Discounts are ids on an invoice unless expanded.
    def retrieve_invoice(id, expand: [])
      call { @client.v1.invoices.retrieve(id, { expand: }) }
    end

    def retrieve_promotion_code(id)
      call { @client.v1.promotion_codes.retrieve(id) }
    end

    # Invoice that a payment intent paid (subscription payments carry no
    # invoice id on the charge), or nil.
    def invoice_id_for_payment_intent(payment_intent_id)
      list = call do
        @client.v1.invoice_payments.list({ payment: { type: "payment_intent", payment_intent: payment_intent_id }, limit: 1 })
      end
      payment = Array(list["data"]).first
      invoice = payment && payment["invoice"]
      invoice.is_a?(Hash) ? invoice["id"] : invoice
    end

    private
      def call
        JSON.parse(yield.to_json)
      rescue Stripe::StripeError => e
        raise Error, e.message
      end
  end
end
