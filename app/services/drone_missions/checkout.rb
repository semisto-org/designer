module DroneMissions
  # The Stripe Checkout Session of an accepted drone mission: the pilot's
  # flat price and, when they charge it, the travel fees, as two lines with
  # the amounts frozen on the mission. Semisto acts in the pilot's name and
  # on their behalf (on_behalf_of: the pilot is the seller the client sees);
  # the money waits on Semisto's account (transfer group of the mission)
  # until the pilot is paid their share (Payout). The client keeps the
  # Stripe customer of their plans.
  class Checkout
    class Unavailable < StandardError; end

    def self.call(...) = new(...).call

    def initialize(mission, success_url:, cancel_url:, gateway: nil)
      @mission = mission
      @success_url = success_url
      @cancel_url = cancel_url
      @gateway = gateway
    end

    # The URL of the Stripe-hosted payment page.
    def call
      raise Unavailable, "billing disabled" unless Billing.enabled?
      raise Unavailable, "not accepted" unless @mission.accepted?
      gateway.create_checkout_session(params).fetch("url")
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def client = @mission.client
      def pilot = @mission.drone_pilot

      def customer_id
        return client.billing_account.stripe_customer_id if client.billing_account
        customer = gateway.create_customer(email: client.email_address, name: client.name, metadata: { user_id: client.id.to_s })
        Billing::Identity.link_customer(client, customer.fetch("id"))
        client.reload.billing_account.stripe_customer_id
      end

      def line(name, cents)
        { price_data: { currency: @mission.currency, unit_amount: cents, product_data: { name: } }, quantity: 1 }
      end

      def line_items
        items = [ line(I18n.t("drone_missions.checkout.mission", pilot: pilot.display_name, map: @mission.map.name), @mission.price_cents) ]
        items << line(I18n.t("drone_missions.checkout.travel", km: @mission.travel_km), @mission.travel_cents) if @mission.travel_cents.positive?
        items
      end

      def params
        metadata = { drone_mission_id: @mission.id.to_s, user_id: client.id.to_s, drone_pilot_id: pilot.id.to_s }
        description = I18n.t("drone_missions.checkout.description", id: @mission.id, pilot: pilot.display_name)
        {
          mode: "payment",
          customer: customer_id,
          customer_update: { address: "auto", name: "auto" },
          billing_address_collection: "required",
          client_reference_id: client.id.to_s,
          line_items:,
          locale: "fr",
          metadata:,
          payment_intent_data: { description:, metadata:, transfer_group: @mission.transfer_group, on_behalf_of: pilot.stripe_account_id }.compact,
          success_url: @success_url,
          cancel_url: @cancel_url
        }
      end
  end
end
