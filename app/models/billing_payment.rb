# One payment Stripe collected, for the revenue-share statement: amount (tax
# included), tax, currency, plan and promotion code. Written once by the
# webhooks; only the refunded amount and invoice links change afterwards.
class BillingPayment < ApplicationRecord
  belongs_to :user
  belongs_to :plan_purchase, optional: true
  belongs_to :plan_subscription, optional: true
  belongs_to :invoice_request, optional: true

  validates :plan_key, :currency, :paid_at, presence: true
  validates :amount_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :stripe_checkout_session_id, uniqueness: true, allow_nil: true
  validates :stripe_invoice_id, uniqueness: true, allow_nil: true

  scope :newest_first, -> { order(paid_at: :desc, id: :desc) }
  scope :live, -> { where(livemode: true) }
  scope :between, ->(from, to) { where(paid_at: from...to) }

  # Amount before VAT, what Semisto's share is usually computed on.
  def net_cents = amount_cents - tax_cents
  def fully_refunded? = refunded_cents >= amount_cents && amount_cents.positive?
end
