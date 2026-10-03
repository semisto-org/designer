# Mirror of a Stripe subscription (Atelier, Bureau d'études), kept in sync by
# the webhooks (customer.subscription.*).
class PlanSubscription < ApplicationRecord
  PLAN_KEYS = %w[atelier bureau].freeze
  ACTIVE_STATUSES = %w[active trialing].freeze

  belongs_to :user
  has_many :billing_payments, dependent: :restrict_with_error

  validates :plan_key, inclusion: { in: PLAN_KEYS }
  validates :status, :stripe_subscription_id, presence: true
  validates :stripe_subscription_id, uniqueness: true

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  # Subscriptions that currently give access: active or trialing, or past due
  # within the grace period that starts at the first failed payment.
  scope :granting_access, ->(at = Time.current) {
    where(status: ACTIVE_STATUSES)
      .or(where(status: "past_due").where("past_due_since > ?", at - Billing::PAST_DUE_GRACE))
  }

  def grants_access?(at = Time.current)
    return true if ACTIVE_STATUSES.include?(status)
    status == "past_due" && past_due_since.present? && past_due_since > at - Billing::PAST_DUE_GRACE
  end

  def past_due? = status == "past_due"
  def canceling? = cancel_at_period_end && grants_access?
end
