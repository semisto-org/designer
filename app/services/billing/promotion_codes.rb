module Billing
  # Which promotion code (the individual codes Michael e-mails to Semisto
  # members) a payment used, as the code text, for the revenue ledger.
  # Webhook payloads only carry ids, so the code is looked up in Stripe, but
  # only when a discount was actually applied.
  class PromotionCodes
    def initialize(gateway)
      @gateway = gateway
    end

    def for_session(session)
      return nil unless discounted?(session)
      code = code_from(Array(session["discounts"]).map { |discount| discount["promotion_code"] })
      return code if code
      expanded = session.dig("total_details", "breakdown") ? session : @gateway.retrieve_checkout_session(session["id"])
      code_from(Array(expanded.dig("total_details", "breakdown", "discounts")).map { |line| line.dig("discount", "promotion_code") })
    end

    def for_invoice(invoice)
      discounts = Array(invoice["discounts"])
      return nil if discounts.empty?
      discounts = Array(@gateway.retrieve_invoice(invoice["id"], expand: [ "discounts" ])["discounts"]) if discounts.any?(String)
      code_from(discounts.map { |discount| discount.is_a?(Hash) ? discount["promotion_code"] : nil })
    end

    private
      def discounted?(session)
        session.dig("total_details", "amount_discount").to_i.positive? || Array(session["discounts"]).any?
      end

      def code_from(references)
        reference = references.compact.first
        return nil unless reference
        return reference["code"] if reference.is_a?(Hash) && reference["code"]
        @gateway.retrieve_promotion_code(Payload.id_of(reference))["code"]
      end
  end
end
