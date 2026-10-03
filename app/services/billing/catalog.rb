module Billing
  # The plans on sale. Prices are what the customer pays, VAT included (the
  # Stripe prices must be created with tax_behavior "inclusive"); they are
  # shown on the pricing and billing pages and must match the Stripe prices.
  # Names and descriptions live in config/locales/billing.fr.yml.
  module Catalog
    Plan = Data.define(:key, :kind, :price_cents, :interval, :max_maps) do
      def subscription? = kind == :subscription
      def one_time? = kind == :one_time
      def free? = kind == :free
      def mode = subscription? ? "subscription" : "payment"
      def purchasable? = !free? && Billing.price_id(key).present?
    end

    MEMBER_DISCOUNT_PERCENT = 30
    YEARLY_PASS_DURATION = 1.year

    PLANS = [
      Plan.new("free", :free, 0, nil, Entitlements::PLANS.dig("free", :max_maps)),
      Plan.new("yearly", :one_time, 7_900, "year", Entitlements::PLANS.dig("yearly", :max_maps)),
      Plan.new("atelier", :subscription, 4_900, "month", Entitlements::PLANS.dig("atelier", :max_maps)),
      Plan.new("bureau", :subscription, 9_900, "month", Entitlements::PLANS.dig("bureau", :max_maps)),
      Plan.new("drone", :one_time, 28_000, nil, nil)
    ].freeze

    module_function

    def all = PLANS
    def find(key) = PLANS.find { |plan| plan.key == key.to_s }
    def fetch(key) = find(key) || raise(KeyError, "unknown plan #{key.inspect}")

    # Plan a Stripe Price id was configured for (webhook payloads carry ids).
    def plan_key_for_price(price_id)
      return nil if price_id.blank?
      Billing::PLAN_PRICE_ENV.keys.find { |key| Billing.price_id(key) == price_id }
    end

    def member_price_cents
      (find("yearly").price_cents * (100 - MEMBER_DISCOUNT_PERCENT) / 100.0).round
    end

    def as_json(*)
      PLANS.map do |plan|
        {
          key: plan.key, kind: plan.kind, priceCents: plan.price_cents, interval: plan.interval,
          maxMaps: plan.max_maps, purchasable: plan.free? ? false : plan.purchasable?
        }
      end
    end
  end
end
