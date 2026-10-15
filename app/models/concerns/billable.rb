# What a user has paid for. Entitlements.for(user) asks current_plan_key.
module Billable
  extend ActiveSupport::Concern

  included do
    has_one :billing_account, dependent: :destroy
    has_many :plan_purchases, dependent: :restrict_with_error
    has_many :plan_subscriptions, dependent: :restrict_with_error
    has_many :billing_payments, dependent: :restrict_with_error
    has_many :invoice_requests, dependent: :restrict_with_error
    has_many :plan_grants, dependent: :restrict_with_error
    has_many :paid_teams, class_name: "Organization", foreign_key: :billing_user_id, inverse_of: :billing_user, dependent: :nullify
  end

  # "yearly" while a yearly pass is valid, "atelier" / "bureau" while the
  # subscription gives access, the plan granted on invoice while it runs,
  # otherwise "free" (best plan if several).
  def current_plan_key(at: Time.current)
    Billing::PlanResolver.call(self, at:)
  end

  def current_yearly_pass(at: Time.current)
    plan_purchases.valid_at(at).order(expires_at: :desc).first
  end

  # The latest yearly pass that ran out and was not replaced by a valid one.
  def last_expired_pass(at: Time.current)
    return nil if current_yearly_pass(at:)
    plan_purchases.yearly.paid.where(expires_at: ..at).order(expires_at: :desc).first
  end

  def current_plan_subscription(at: Time.current)
    plan_subscriptions.granting_access(at).max_by { |s| Entitlements::PLANS.fetch(s.plan_key)[:max_maps] }
  end

  # The best plan granted on invoice that runs now, or nil.
  def current_plan_grant(at: Time.current)
    plan_grants.active_at(at).max_by { |grant| [ Entitlements::PLANS.fetch(grant.plan_key)[:max_maps], grant.ends_at ] }
  end

  # The active maps this user's plan pays for: their own maps (outside a team,
  # or in a team nobody pays for) and every map of the teams they pay for.
  def billed_maps
    unpaid_teams = Organization.where(billing_user_id: nil).select(:id)
    Map.active.where(owner_id: id, organization_id: nil)
      .or(Map.active.where(owner_id: id, organization_id: unpaid_teams))
      .or(Map.active.where(organization_id: Organization.where(billing_user_id: id).select(:id)))
  end

  # Billed maps that are read-only because they exceed the plan's limit.
  def read_only_maps_count
    return 0 unless Billing.enabled?
    [ billed_maps.count - entitlements_for_billing.max_maps, 0 ].max
  end

  # The subscription to show on the billing page, even when it ran out.
  def latest_plan_subscription
    plan_subscriptions.newest_first.first
  end

  private
    # Fresh entitlements: the memoized User#entitlements may predate a purchase.
    def entitlements_for_billing = Entitlements.for(self)
end
