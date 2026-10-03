module Billing
  # Mirrors a Stripe subscription into a PlanSubscription (created or
  # updated). Events can arrive out of order: an older snapshot never
  # overwrites a newer one.
  class SubscriptionSync
    def self.call(...) = new(...).call

    def initialize(subscription, fallback_user: nil, synced_at: Time.current)
      @sub = subscription
      @fallback_user = fallback_user
      @synced_at = synced_at
    end

    def call
      user = Identity.user_for(@sub) || @fallback_user
      return "unknown customer" unless user
      Identity.link_customer(user, Payload.id_of(@sub["customer"]))

      price_id = Payload.subscription_price_id(@sub)
      plan_key = Catalog.plan_key_for_price(price_id) || @sub.dig("metadata", "plan_key")
      return "unknown plan" unless PlanSubscription::PLAN_KEYS.include?(plan_key)

      record = PlanSubscription.find_or_initialize_by(stripe_subscription_id: @sub.fetch("id"))
      return "stale subscription event" if record.synced_at && record.synced_at > @synced_at

      period_start, period_end = Payload.subscription_period(@sub)
      status = @sub.fetch("status")
      record.assign_attributes(
        user:, plan_key:, status:,
        stripe_customer_id: Payload.id_of(@sub["customer"]),
        stripe_price_id: price_id,
        current_period_start: period_start, current_period_end: period_end,
        cancel_at_period_end: @sub["cancel_at_period_end"] == true,
        canceled_at: Payload.time(@sub["canceled_at"]),
        ended_at: Payload.time(@sub["ended_at"]),
        past_due_since: status == "past_due" ? (record.past_due_since || @synced_at) : nil,
        synced_at: @synced_at
      )
      record.save!
      "subscription #{status}"
    end
  end
end
