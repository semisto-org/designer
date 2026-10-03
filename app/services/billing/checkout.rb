module Billing
  # Creates the Stripe Checkout Session for a plan, server side: prices come
  # from the STRIPE_PRICE_* variables, Stripe Tax computes Belgian and EU VAT,
  # members type their individual promotion code on the Checkout page, and
  # one-off payments get an automatic invoice. The user keeps one Stripe
  # customer, created on the first purchase.
  class Checkout
    # reason: :not_configured, :unknown_plan, :price_missing, :manage_in_portal
    class Unavailable < StandardError
      attr_reader :reason

      def initialize(reason)
        @reason = reason
        super(reason.to_s)
      end
    end

    def self.call(...) = new(...).call

    def initialize(user:, plan_key:, success_url:, cancel_url:, terms_url:, gateway: nil)
      @user = user
      @plan = Catalog.find(plan_key)
      @success_url = success_url
      @cancel_url = cancel_url
      @terms_url = terms_url
      @gateway = gateway
    end

    # The URL of the Stripe-hosted payment page.
    def call
      raise Unavailable.new(:not_configured) unless Billing.enabled?
      raise Unavailable.new(:unknown_plan) if @plan.nil? || @plan.free?
      price_id = Billing.price_id(@plan.key) or raise Unavailable.new(:price_missing)
      raise Unavailable.new(:manage_in_portal) if @plan.subscription? && @user.current_plan_subscription

      create_session(price_id).fetch("url")
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      # A customer saved with test keys does not exist with live keys: create a new one once.
      def create_session(price_id)
        attempts = 0
        begin
          gateway.create_checkout_session(session_params(price_id, customer_id))
        rescue Providers::StripeGateway::Error => e
          raise unless e.message.match?(/no such customer/i) && (attempts += 1) == 1
          @user.billing_account&.destroy
          @user.reload
          retry
        end
      end

      def customer_id
        account = @user.billing_account
        return account.stripe_customer_id if account
        customer = gateway.create_customer(email: @user.email_address, name: @user.name, metadata: { user_id: @user.id.to_s })
        Identity.link_customer(@user, customer.fetch("id"))
        @user.reload.billing_account.stripe_customer_id
      end

      def session_params(price_id, customer_id)
        metadata = { user_id: @user.id.to_s, plan_key: @plan.key }
        description = I18n.t("billing.plans.#{@plan.key}.name")
        params = {
          mode: @plan.mode,
          customer: customer_id,
          customer_update: { address: "auto", name: "auto" },
          client_reference_id: @user.id.to_s,
          line_items: [ { price: price_id, quantity: 1 } ],
          automatic_tax: { enabled: true },
          allow_promotion_codes: true,
          tax_id_collection: { enabled: true },
          locale: "fr",
          metadata:,
          success_url: @success_url,
          cancel_url: @cancel_url,
          custom_text: { submit: { message: I18n.t("billing.checkout.terms", url: @terms_url) } }
        }
        if @plan.subscription?
          params[:subscription_data] = { metadata:, description: }
        else
          params[:invoice_creation] = { enabled: true, invoice_data: { description:, metadata: } }
          params[:payment_intent_data] = { description:, metadata: }
        end
        params
      end
  end
end
