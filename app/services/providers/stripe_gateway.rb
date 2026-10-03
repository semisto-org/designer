module Providers
  # Everything we ask Stripe, behind a small stable interface (Checkout,
  # customer portal, lookups used while processing webhooks). Responses are
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

    def create_customer(email:, name: nil, metadata: {})
      call { @client.v1.customers.create({ email:, name:, metadata: }.compact) }
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
