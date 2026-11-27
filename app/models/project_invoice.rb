# « Budget du projet »: an invoice the team sent its client, recorded here
# (never issued: the invoice itself is made in the team's own tool, sent over
# Peppol in Belgium). Its number, its date, its amount before VAT split over
# the project's four budget items (ProjectBudget::ITEMS), the VAT as written
# on it, and the PDF, so the team sees what each item has already invoiced.
# No lines, no accounting (Michael, 2026-11-27). Paid or not is one date.
class ProjectInvoice < ApplicationRecord
  include CountsTowardStorage

  ITEMS = %w[services expenses plants implementation].freeze
  SOURCES = TimeEntry::SOURCES
  MAX_CENTS = 100_000_000
  DOCUMENT_TYPES = %w[application/pdf image/jpeg image/png image/webp].freeze
  MAX_DOCUMENT_BYTES = 15.megabytes

  belongs_to :map
  belongs_to :user, optional: true

  has_one_attached :document

  normalizes :number, :note, with: ->(value) { value.to_s.strip.presence }

  validates :number, presence: true, length: { maximum: 60 }, uniqueness: { scope: :map_id, case_sensitive: false }
  validates :issued_on, presence: true
  ITEMS.each { validates :"#{_1}_cents", numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: MAX_CENTS } }
  validates :vat_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: MAX_CENTS }
  validates :note, length: { maximum: 1_000 }
  validates :source, inclusion: { in: SOURCES }
  validate :something_invoiced
  validate :dates_make_sense
  validate :document_kind

  scope :chronological, -> { order(:issued_on, :id) }

  # Only the team that runs the project records its invoices; the plan has
  # « Temps et dépenses », and the map is not frozen.
  def self.writable_by?(map, user)
    !map.read_only_by_plan? && !map.archived? && TimeEntry.usable_by?(map, user)
  end

  def item_cents(item) = public_send(:"#{item}_cents")
  def amount_cents = ITEMS.sum { item_cents(_1) }
  def total_cents = amount_cents + vat_cents
  def paid? = paid_on.present?

  # The VAT a split would carry by default: plants at 6 %, the rest at 21 %
  # in Belgium (the team corrects it to what its invoice says).
  def self.default_vat_cents(cents_by_item)
    cents_by_item.sum { |item, cents| (cents.to_i * (item.to_s == "plants" ? 6 : 21) / 100.0).round }
  end

  def as_json(document_url: nil, **)
    {
      id:, mapId: map_id, number:, issuedOn: issued_on.iso8601, paidOn: paid_on&.iso8601, paid: paid?,
      items: ITEMS.index_with { item_cents(_1) }, amountCents: amount_cents, vatCents: vat_cents, totalCents: total_cents,
      note:, source:, userName: user&.display_name,
      document: document.attached? ? { name: document.filename.to_s, contentType: document.content_type, url: document_url } : nil
    }
  end

  private
    def something_invoiced
      errors.add(:base, :nothing_invoiced) if ITEMS.all? { item_cents(_1).to_i.zero? }
    end

    def dates_make_sense
      errors.add(:issued_on, :future) if issued_on && issued_on > Date.current + 31
      errors.add(:paid_on, :before_issue) if paid_on && issued_on && paid_on < issued_on
    end

    def document_kind
      return unless document.attached? && attachment_changes["document"]
      errors.add(:document, :content_type) unless DOCUMENT_TYPES.include?(document.content_type)
      errors.add(:document, :too_big) if document.byte_size > MAX_DOCUMENT_BYTES
    end
end
