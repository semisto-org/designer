module DronePilots
  # A pilot's way to their Stripe Connect account: created on the first
  # click (Express, transfers only), then the Stripe-hosted onboarding page;
  # once complete, the Express dashboard. Stripe checks their identity and
  # bank account; Terranova only keeps the account id and whether it can be
  # paid (account.updated, or refresh! when the pilot comes back).
  class StripeOnboarding
    def initialize(pilot, gateway: nil)
      @pilot = pilot
      @gateway = gateway
    end

    def url(refresh_url:, return_url:)
      return gateway.create_login_link(@pilot.stripe_account_id).fetch("url") if @pilot.payouts_enabled? && @pilot.details_submitted?
      gateway.create_account_link(account: account_id, refresh_url:, return_url:).fetch("url")
    end

    def refresh!
      return unless @pilot.stripe_account_id
      @pilot.sync_stripe_account!(gateway.retrieve_account(@pilot.stripe_account_id))
    end

    # account.updated, for any connected account Terranova knows.
    def self.sync(account)
      pilot = DronePilot.find_by(stripe_account_id: account["id"])
      return "unknown account" unless pilot
      pilot.sync_stripe_account!(account)
      "pilot account synced"
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def account_id
        return @pilot.stripe_account_id if @pilot.stripe_account_id
        account = gateway.create_account(email: @pilot.user.email_address, country: @pilot.country,
          metadata: { drone_pilot_id: @pilot.id.to_s, user_id: @pilot.user_id.to_s })
        @pilot.update!(stripe_account_id: account.fetch("id"))
        @pilot.stripe_account_id
      end
  end
end
