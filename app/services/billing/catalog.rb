module Billing
  # The plans on sale. Prices are what the customer pays, VAT included (the
  # Stripe prices must be created with tax_behavior "inclusive"); they are
  # shown on the pricing and billing pages and must match the Stripe prices.
  # Names and descriptions live in config/locales/billing.fr.yml. Plan keys
  # keep their first names (see Entitlements): yearly = Home, atelier = Pro,
  # bureau = Team.
  module Catalog
    Plan = Data.define(:key, :kind, :price_cents, :yearly_price_cents, :interval, :max_maps) do
      def subscription? = kind == :subscription
      def one_time? = kind == :one_time
      def free? = kind == :free
      def mode = subscription? ? "subscription" : "payment"
      def purchasable? = !free? && Billing.price_id(key).present?
      # Pro and Team can also be paid by the year.
      def yearly_option? = subscription? && yearly_price_cents.present?
      def yearly_purchasable? = yearly_option? && Billing.price_id(key, "year").present?
      # The yearly price during the launch offer (the first year only).
      def launch_price_cents = yearly_option? ? yearly_price_cents - price_cents * LAUNCH_EXTRA_FREE_MONTHS : nil
    end

    YEARLY_PASS_DURATION = 1.year
    # Semisto members in good standing pay this much less for Home.
    MEMBER_DISCOUNT_CENTS = 2_000
    # Paying Pro or Team by the year: 12 months for the price of 10.
    YEARLY_FREE_MONTHS = 2
    # Launch offer: a yearly Pro or Team subscription taken before this
    # moment (Brussels time) gets one more month off its first year.
    LAUNCH_EXTRA_FREE_MONTHS = 1
    LAUNCH_OFFER_ENDS_AT = Time.find_zone!("Europe/Brussels").local(2027, 1, 1)

    PLANS = [
      Plan.new("free", :free, 0, nil, nil, Entitlements::PLANS.dig("free", :max_maps)),
      Plan.new("yearly", :one_time, 7_900, nil, "year", Entitlements::PLANS.dig("yearly", :max_maps)),
      Plan.new("atelier", :subscription, 4_900, 4_900 * (12 - YEARLY_FREE_MONTHS), "month", Entitlements::PLANS.dig("atelier", :max_maps)),
      Plan.new("bureau", :subscription, 12_900, 12_900 * (12 - YEARLY_FREE_MONTHS), "month", Entitlements::PLANS.dig("bureau", :max_maps)),
      Plan.new("drone", :one_time, 38_000, nil, nil, nil)
    ].freeze

    module_function

    def all = PLANS
    def find(key) = PLANS.find { |plan| plan.key == key.to_s }
    def fetch(key) = find(key) || raise(KeyError, "unknown plan #{key.inspect}")

    # Plan a Stripe Price id was configured for (webhook payloads carry ids).
    def plan_key_for_price(price_id)
      return nil if price_id.blank?
      Billing::PLAN_PRICE_ENV.find { |key, prices| prices.values.any? { |env| ENV[env].presence == price_id } }&.first
    end

    def member_price_cents
      find("yearly").price_cents - MEMBER_DISCOUNT_CENTS
    end

    def launch_offer?(at = Time.current) = at < LAUNCH_OFFER_ENDS_AT

    def as_json(*)
      PLANS.map do |plan|
        {
          key: plan.key, kind: plan.kind, priceCents: plan.price_cents, interval: plan.interval,
          yearlyPriceCents: plan.yearly_price_cents, launchPriceCents: (plan.launch_price_cents if launch_offer?),
          maxMaps: plan.max_maps, storageGb: Entitlements::PLANS.dig(plan.key, :storage_gb),
          renderingsPerMonth: Entitlements::PLANS.dig(plan.key, :renderings_per_month),
          purchasable: plan.free? ? false : plan.purchasable?, yearlyPurchasable: plan.yearly_purchasable?
        }
      end
    end
  end
end
