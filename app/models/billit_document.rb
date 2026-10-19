# The legal invoice (or credit note) of a payment by a Belgian business,
# made in Billit and sent over Peppol (Billing::BillitInvoicing). Stripe's own
# invoice stays the payment receipt. A payment that needs none (a private
# person, a business outside Belgium) gets one "skipped" invoice row, so it is
# not looked at again.
#
# Status: pending (not in Billit yet, or the last try failed: see last_error),
# created (in Billit, not sent), sent, delivered, refused (the Peppol network
# or the customer turned it down), skipped.
class BillitDocument < ApplicationRecord
  KINDS = %w[invoice credit_note].freeze
  STATUSES = %w[pending created sent delivered refused skipped].freeze
  # A document that keeps failing is left for a person (Sentry has each error).
  MAX_ATTEMPTS = 8

  belongs_to :billing_payment

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :idempotency_key, presence: true, uniqueness: true
  validates :amount_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  scope :invoices, -> { where(kind: "invoice") }
  scope :credit_notes, -> { where(kind: "credit_note") }
  scope :retryable, -> { where(status: %w[pending created]).where(attempts: ...MAX_ATTEMPTS) }

  def invoice? = kind == "invoice"
  def in_billit? = order_number.present? && status != "skipped"
end
