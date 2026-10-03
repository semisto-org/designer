# A one-off purchase. The yearly pass ("Forfait particulier") is paid once
# and never renewed automatically: it is valid from starts_at to expires_at.
# The drone mission is a manual service: it has no expiry.
class PlanPurchase < ApplicationRecord
  PLAN_KEYS = %w[yearly drone].freeze
  STATUSES = %w[paid refunded].freeze

  belongs_to :user
  has_many :billing_payments, dependent: :restrict_with_error
  has_many :billing_notices, dependent: :destroy

  validates :plan_key, inclusion: { in: PLAN_KEYS }
  validates :status, inclusion: { in: STATUSES }
  validates :starts_at, presence: true
  validates :expires_at, presence: true, if: :yearly?
  validates :stripe_checkout_session_id, presence: true, uniqueness: true

  scope :yearly, -> { where(plan_key: "yearly") }
  scope :drone, -> { where(plan_key: "drone") }
  scope :paid, -> { where(status: "paid") }
  scope :valid_at, ->(time) { yearly.paid.where("starts_at <= ? AND expires_at > ?", time, time) }
  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  # Notify Semisto once the order is committed: the drone mission is delivered by hand.
  after_create_commit :notify_drone_order, if: -> { plan_key == "drone" }

  def yearly? = plan_key == "yearly"
  def drone? = plan_key == "drone"

  def active?(at = Time.current)
    yearly? && status == "paid" && starts_at <= at && expires_at > at
  end

  def expired?(at = Time.current)
    yearly? && status == "paid" && expires_at <= at
  end

  def days_left(at = Time.current)
    return nil unless yearly? && expires_at
    ((expires_at - at) / 1.day).ceil
  end

  # A pass bought while another one is still valid starts when that one ends,
  # so renewing early never wastes days.
  def self.next_pass_window(user, paid_at)
    current_end = user.plan_purchases.valid_at(paid_at).maximum(:expires_at)
    starts_at = [ paid_at, current_end ].compact.max
    [ starts_at, starts_at + Billing::Catalog::YEARLY_PASS_DURATION ]
  end

  private
    def notify_drone_order
      BillingMailer.drone_ordered(self).deliver_later
    end
end
