module Billing
  # « Codes promo » (/admin/promo-codes): what a super admin types to make a
  # promotion code for beta testers, and how it becomes one Stripe coupon
  # (the discount, restricted to the chosen plans' products) plus one
  # promotion code (the text people type at Checkout, with its limits).
  # Also turns a promotion code listed by Stripe into a row for the screen.
  class PromoCodeForm
    include ActiveModel::Model
    include ActiveModel::Attributes

    # Every paid plan but the drone mission, which Semisto quotes itself.
    DEFAULT_PLAN_KEYS = %w[yearly atelier bureau].freeze
    PLAN_KEYS = Billing::PLAN_PRICE_ENV.keys.freeze
    DISCOUNT_TYPES = %w[percent amount].freeze
    DURATIONS = %w[once repeating forever].freeze
    CODE_FORMAT = /\A[A-Z0-9][A-Z0-9-]{2,39}\z/
    # No 0/O or 1/I: the code is read aloud and copied from e-mails.
    SUGGESTION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars.freeze
    MAX_MONTHS = 36
    MAX_AMOUNT_EUROS = 10_000

    attribute :code, :string
    attribute :discount_type, :string, default: "percent"
    attribute :percent_off, :decimal
    attribute :amount_off, :decimal
    attribute :duration, :string, default: "once"
    attribute :duration_in_months, :integer
    attribute :plan_keys, default: -> { DEFAULT_PLAN_KEYS.dup }
    attribute :max_redemptions, :integer
    attribute :expires_on, :date
    attribute :first_time_only, :boolean, default: false
    attribute :note, :string

    validates :code, format: { with: CODE_FORMAT, message: :code_format }
    validates :discount_type, inclusion: { in: DISCOUNT_TYPES, message: :invalid }
    validates :percent_off, numericality: { greater_than_or_equal_to: 1, less_than_or_equal_to: 100, message: :percent_range },
      if: :percent?
    validates :amount_off, numericality: { greater_than: 0, less_than_or_equal_to: MAX_AMOUNT_EUROS, message: :amount_range },
      unless: :percent?
    validates :duration, inclusion: { in: DURATIONS, message: :invalid }
    validates :duration_in_months, numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: MAX_MONTHS,
      message: :months_range }, if: :repeating?
    validates :max_redemptions, numericality: { only_integer: true, greater_than_or_equal_to: 1, message: :max_redemptions_range },
      allow_nil: true
    validates :note, length: { maximum: 200 }
    validate :plans_are_on_sale
    validate :expires_in_the_future

    def self.suggested_code = "BETA-#{Array.new(4) { SUGGESTION_ALPHABET.sample(random: SecureRandom) }.join}"

    # Plans a code can apply to: those with a Stripe price configured.
    def self.configured_plan_keys = PLAN_KEYS.select { |key| Billing.price_id(key) }

    def code=(value)
      super(value.to_s.strip.upcase.gsub(/\s+/, "-").presence)
    end

    def plan_keys=(value)
      super(Array(value).map(&:to_s).compact_blank.uniq)
    end

    def note=(value)
      super(value.to_s.strip.presence)
    end

    def percent? = discount_type == "percent"
    def repeating? = duration == "repeating"

    # Creates the coupon, then its promotion code (the coupon is removed if
    # Stripe refuses the code, so a refused code leaves nothing behind).
    # Returns the promotion code; raises Providers::StripeGateway::Error.
    def issue!(gateway, by:)
      coupon = gateway.create_coupon(coupon_params(product_ids(gateway), by:))
      begin
        gateway.create_promotion_code(promotion_code_params(coupon["id"], by:))
      rescue Providers::StripeGateway::Error
        begin
          gateway.delete_coupon(coupon["id"])
        rescue Providers::StripeGateway::Error => e
          Rails.error.report(e, handled: true)
        end
        raise
      end
    end

    def coupon_params(products, by:)
      discount = percent? ? { percent_off: percent_off.to_f } : { amount_off: (amount_off * 100).round, currency: "eur" }
      {
        name: code, duration:, duration_in_months: (duration_in_months if repeating?),
        applies_to: { products: },
        metadata: metadata(by)
      }.merge(discount).compact
    end

    def promotion_code_params(coupon_id, by:)
      {
        promotion: { type: "coupon", coupon: coupon_id },
        code:, max_redemptions:,
        expires_at: expires_on&.in_time_zone&.end_of_day&.to_i,
        restrictions: (first_time_only ? { first_time_transaction: true } : nil),
        metadata: metadata(by)
      }.compact
    end

    # A promotion code as Stripe lists it (coupon expanded), for the screen.
    def self.row(promotion_code, payments_count: 0)
      coupon = promotion_code.dig("promotion", "coupon")
      coupon = {} unless coupon.is_a?(Hash)
      metadata = (coupon["metadata"] || {}).merge(promotion_code["metadata"] || {})
      {
        id: promotion_code["id"], code: promotion_code["code"], active: promotion_code["active"] == true,
        timesRedeemed: promotion_code["times_redeemed"].to_i, maxRedemptions: promotion_code["max_redemptions"],
        expiresAt: timestamp(promotion_code["expires_at"]), createdAt: timestamp(promotion_code["created"]),
        firstTimeOnly: promotion_code.dig("restrictions", "first_time_transaction") == true,
        percentOff: coupon["percent_off"], amountOffCents: coupon["amount_off"], currency: coupon["currency"],
        duration: coupon["duration"], durationInMonths: coupon["duration_in_months"],
        planKeys: metadata["plan_keys"].to_s.split(",").presence,
        note: metadata["note"].presence, createdBy: metadata["created_by"].presence,
        paymentsCount: payments_count
      }
    end

    def self.timestamp(value) = value.present? ? Time.zone.at(value.to_i).iso8601 : nil

    private
      def metadata(by)
        { created_by: by&.email_address, note:, plan_keys: plan_keys.join(",") }.compact
      end

      def product_ids(gateway)
        plan_keys.map { |key| Payload.id_of(gateway.retrieve_price(Billing.price_id(key))["product"]) }.compact.uniq
      end

      def plans_are_on_sale
        if plan_keys.empty?
          errors.add(:plan_keys, :no_plan)
        elsif (missing = plan_keys - self.class.configured_plan_keys).any?
          errors.add(:plan_keys, :plan_not_configured, plans: missing.map { |key| I18n.t("billing.plans.#{key}.name") }.join(", "))
        end
      end

      def expires_in_the_future
        errors.add(:expires_on, :in_the_past) if expires_on && expires_on < Date.current
      end
  end
end
