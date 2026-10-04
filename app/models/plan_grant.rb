# A plan given by Semisto for a period, outside Stripe Checkout: today, the
# plan paid on invoice by a commune, a school or a company (it can start
# before the transfer arrives). It counts like a pass while
# starts_at <= now < ends_at and it is not revoked (Billing::PlanResolver).
# When it ends, nothing is deleted: maps beyond the free limit become
# read-only, as when a pass expires.
class PlanGrant < ApplicationRecord
  PLAN_KEYS = InvoiceRequest::PLAN_KEYS

  belongs_to :user
  belongs_to :invoice_request, optional: true
  belongs_to :granted_by, class_name: "User", optional: true
  has_many :billing_notices, dependent: :destroy

  validates :plan_key, inclusion: { in: PLAN_KEYS }
  validates :starts_at, :ends_at, presence: true
  validates :invoice_request_id, uniqueness: true, allow_nil: true
  validate :ends_after_start

  scope :not_revoked, -> { where(revoked_at: nil) }
  scope :active_at, ->(time) { not_revoked.where("starts_at <= ? AND ends_at > ?", time, time) }
  # Still to come or running: shown on the billing page.
  scope :current_or_upcoming, ->(time = Time.current) { not_revoked.where("ends_at > ?", time) }
  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  after_create_commit :notify_activation, if: :invoice_request

  # When a new grant of `plan_key` should start: now, or when the same plan
  # already granted to the user ends (renewing early never wastes days).
  def self.next_start(user, plan_key, at = Time.current)
    current_end = user.plan_grants.active_at(at).where(plan_key:).maximum(:ends_at)
    [ at, current_end ].compact.max
  end

  def active?(at = Time.current) = revoked_at.nil? && starts_at <= at && ends_at > at
  def revoked? = revoked_at.present?
  def on_invoice? = invoice_request_id.present?

  def days_left(at = Time.current)
    ((ends_at - at) / 1.day).ceil
  end

  def revoke!(at: Time.current)
    update!(revoked_at: at) unless revoked?
  end

  def as_json_for_billing(at = Time.current)
    {
      id:, planKey: plan_key, startsAt: starts_at.iso8601, endsAt: ends_at.iso8601,
      active: active?(at), revokedAt: revoked_at&.iso8601, onInvoice: on_invoice?, daysLeft: days_left(at)
    }
  end

  private
    def ends_after_start
      errors.add(:ends_at, :before_start) if starts_at && ends_at && ends_at <= starts_at
    end

    def notify_activation
      InvoicingMailer.plan_activated(self).deliver_later
    end
end
