module Billing
  # Which plan a user is on right now. The best valid source wins (most maps):
  # a valid yearly pass, or a subscription that is active, trialing or past
  # due within the grace period. Everything else is "free".
  class PlanResolver
    def self.call(user, at: Time.current) = new(user, at:).plan_key

    def initialize(user, at: Time.current)
      @user = user
      @at = at
    end

    def plan_key
      return "free" if @user.nil? || !@user.persisted?
      candidates = []
      candidates << "yearly" if @user.current_yearly_pass(at: @at)
      subscription = @user.current_plan_subscription(at: @at)
      candidates << subscription.plan_key if subscription
      candidates.max_by { |key| Entitlements::PLANS.fetch(key)[:max_maps] } || "free"
    end
  end
end
