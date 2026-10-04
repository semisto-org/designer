# « Payer sur facture »: a commune, a school, an association or a company
# asks for an invoice payable by bank transfer instead of paying by card,
# often with its purchase-order number. Semisto staff send the invoice
# (through Stripe when billing is on, by hand otherwise), can start the plan
# before the payment arrives (PlanGrant), and mark the request paid.
#
# Status: requested → invoiced (Stripe invoice sent) → paid, or cancelled.
# A request made by hand goes straight from requested to paid.
class InvoiceRequest < ApplicationRecord
  PLAN_KEYS = %w[atelier bureau yearly].freeze
  STATUSES = %w[requested invoiced paid cancelled].freeze
  DURATION_MONTHS = 12

  # Raised when staff try to start the plan of a cancelled request.
  class Closed < StandardError; end

  belongs_to :user
  belongs_to :handled_by, class_name: "User", optional: true
  has_one :plan_grant, dependent: :restrict_with_error
  has_many :billing_payments, dependent: :restrict_with_error

  normalizes :organization_name, :company_number, :purchase_order, with: ->(value) { value.to_s.squish.presence }
  normalizes :billing_address, with: ->(value) { value.to_s.lines.map(&:squish).compact_blank.join("\n").presence }
  normalizes :billing_email, with: ->(value) { value.to_s.strip.downcase.presence }
  normalizes :message, with: ->(value) { value.to_s.strip.presence }

  validates :organization_name, presence: true, length: { maximum: 200 }
  validates :billing_address, presence: true, length: { maximum: 1_000 }
  validates :billing_email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP, allow_blank: true }
  validates :company_number, length: { maximum: 40 }
  # Printed on the Stripe invoice (custom fields hold 140 characters).
  validates :purchase_order, length: { maximum: 100 }
  validates :message, length: { maximum: 3_000 }
  validates :plan_key, inclusion: { in: PLAN_KEYS }
  validates :status, inclusion: { in: STATUSES }
  validates :duration_months, numericality: { only_integer: true, greater_than: 0 }
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :stripe_invoice_id, uniqueness: true, allow_nil: true

  before_validation :price_from_catalog, on: :create
  after_create_commit :notify

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  # Waiting for Semisto: not invoiced yet, or invoiced and not paid yet.
  scope :pending, -> { where(status: %w[requested invoiced]) }

  STATUSES.each { |name| define_method(:"#{name}?") { status == name } }

  # What a year of the plan costs, VAT included: twelve months of a monthly
  # subscription, or the yearly pass.
  def self.amount_cents_for(plan_key)
    plan = Billing::Catalog.find(plan_key)
    return nil unless plan && PLAN_KEYS.include?(plan.key)
    plan.subscription? ? plan.price_cents * DURATION_MONTHS : plan.price_cents
  end

  # The plans that can be paid on invoice, with their yearly amount.
  def self.plans_json
    PLAN_KEYS.map do |key|
      plan = Billing::Catalog.fetch(key)
      { key:, amountCents: amount_cents_for(key), monthlyCents: plan.subscription? ? plan.price_cents : nil }
    end
  end

  def open? = requested? || invoiced?
  def cancellable? = open?
  def plan_name = I18n.t("billing.plans.#{plan_key}.name")

  # The Stripe invoice was finalized and e-mailed to the billing contact.
  def record_invoice!(invoice, by: nil)
    update!(
      status: "invoiced", invoiced_at: Time.current, handled_by: by || handled_by,
      stripe_invoice_id: invoice["id"], stripe_invoice_number: invoice["number"],
      hosted_invoice_url: invoice["hosted_invoice_url"], invoice_pdf_url: invoice["invoice_pdf"]
    )
  end

  def mark_paid!(at: Time.current, by: nil)
    return self if paid?
    update!(status: "paid", paid_at: at, handled_by: by || handled_by)
  end

  # Ends the request; a plan already started on it stops now (revoked, kept).
  def cancel!(by: nil)
    transaction do
      update!(status: "cancelled", cancelled_at: Time.current, handled_by: by || handled_by)
      plan_grant&.revoke!
    end
  end

  # Starts the plan for a year (duration_months) from `starts_at`, by default
  # today or, when the same plan is already granted, the day it ends (no day
  # lost when a commune renews early). Calling it twice changes nothing.
  def activate!(starts_at: nil, by: nil)
    with_lock do
      raise Closed, "invoice request #{id} is cancelled" if cancelled?
      next plan_grant if plan_grant
      start = starts_at || PlanGrant.next_start(user, plan_key)
      create_plan_grant!(user:, plan_key:, starts_at: start, ends_at: start + duration_months.months, granted_by: by)
    end
  end

  # Where Stripe sends the invoice: the address split into Stripe's fields.
  def stripe_address = Billing::InvoiceAddress.parse(billing_address, organization_name:, company_number:)

  # The company number when it is an EU VAT number ("BE0123456789"), else nil.
  def eu_vat_number = Billing::InvoiceAddress.eu_vat(company_number)

  def as_member_json
    {
      id:, planKey: plan_key, organizationName: organization_name, purchaseOrder: purchase_order,
      status:, amountCents: amount_cents, currency:, createdAt: created_at.iso8601,
      invoiceUrl: hosted_invoice_url, invoiceNumber: stripe_invoice_number
    }
  end

  def as_admin_json
    address = stripe_address
    {
      **as_member_json,
      billingAddress: billing_address, billingEmail: billing_email, companyNumber: company_number,
      euVat: eu_vat_number.present?, message:, durationMonths: duration_months,
      stripeInvoiceId: stripe_invoice_id, invoicePdfUrl: invoice_pdf_url,
      stripeAddress: [ address[:line1], address[:line2], [ address[:postal_code], address[:city] ].compact.join(" ").presence, address[:country] ].compact.join(", "),
      invoicedAt: invoiced_at&.iso8601, paidAt: paid_at&.iso8601, cancelledAt: cancelled_at&.iso8601,
      user: { id: user.id, name: user.display_name, email: user.email_address },
      handledBy: handled_by&.display_name,
      grant: plan_grant && plan_grant.as_json_for_billing,
      suggestedStart: (plan_grant ? nil : PlanGrant.next_start(user, plan_key).to_date.iso8601)
    }
  end

  private
    def price_from_catalog
      self.duration_months ||= DURATION_MONTHS
      self.amount_cents = self.class.amount_cents_for(plan_key)
    end

    def notify
      InvoicingMailer.request_received(self).deliver_later
      InvoicingMailer.request_confirmation(self).deliver_later
    end
end
