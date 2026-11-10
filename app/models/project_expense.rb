# « Temps et dépenses »: one thing a project cost besides time (plants,
# mulch, tree guards, a soil analysis…), with its amount before VAT, its
# VAT rate and who paid it. Four payers (Michael, 2026-11-10):
#
# - rebilled: the team bought it and puts it on the client's invoice;
# - team: the team bought it and keeps it (its own cost);
# - client: the client bought it themselves (the client may note these);
# - designer: a designer advanced it, to be paid back.
#
# The team notes every kind; a viewer (the client) only their own purchases,
# and only once the team turned on « Montrer au client »
# (maps.time_shared_with_client). A receipt (photo or PDF) can go with it.
class ProjectExpense < ApplicationRecord
  include HeicAttachment
  include CountsTowardStorage

  CATEGORIES = %w[plants mulch protections amendments small_material analysis rental other].freeze
  # What each category is weighed against in the accepted offer.
  OFFER_GROUPS = {
    "plants" => "plants",
    "mulch" => "supplies", "protections" => "supplies", "amendments" => "supplies", "small_material" => "supplies"
  }.freeze
  PAYERS = %w[rebilled team client designer].freeze
  VAT_RATES = [ 0, 6, 12, 21 ].freeze
  SOURCES = TimeEntry::SOURCES
  MAX_CENTS = 10_000_000
  RECEIPT_TYPES = (MapPhoto::CONTENT_TYPES + %w[application/pdf]).freeze
  MAX_RECEIPT_BYTES = 15.megabytes

  belongs_to :map
  belongs_to :user, optional: true

  # A photographed ticket is served as a variant, metadata (GPS included)
  # stripped; a PDF as it is (Maps::ProjectExpensesController#receipt).
  has_one_attached :receipt do |attachable|
    attachable.variant :large, resize_to_limit: [ 2000, 2000 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end
  converts_heic :receipt

  normalizes :label, :supplier, :note, with: ->(value) { value.to_s.strip.presence }

  validates :spent_on, :label, presence: true
  validates :category, inclusion: { in: CATEGORIES }
  validates :paid_by, inclusion: { in: PAYERS }
  validates :phase, inclusion: { in: TimeEntry::PHASES }, allow_nil: true
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_CENTS }
  validates :vat_rate, inclusion: { in: VAT_RATES }
  validates :label, :supplier, length: { maximum: 120 }
  validates :note, length: { maximum: 1_000 }
  validates :source, inclusion: { in: SOURCES }
  validate :spent_on_not_far_ahead
  validate :receipt_kind

  scope :chronological, -> { order(:spent_on, :id) }

  # Plants are sold at 6 % in Belgium; mulch, guards and the rest at 21 %.
  def self.default_vat_rate(category) = category == "plants" ? 6 : 21

  # The client (a viewer) sees the project's progress and expenses: the
  # team turned it on, and the plan has « Temps et dépenses ».
  def self.client_view?(map, user)
    map.time_shared_with_client? && map.role_for(user) == "viewer" && TimeEntry.enabled_for?(map)
  end

  # Who may write this expense: the team (TimeEntry.usable_by?) any of
  # them; the client their own purchases only.
  def writable_by?(user)
    return false if map.read_only_by_plan? || map.archived?
    return true if TimeEntry.usable_by?(map, user)
    self.class.client_view?(map, user) && paid_by == "client" && (new_record? ? true : user_id == user&.id)
  end

  def amount = amount_cents / 100.0
  def vat_cents = (amount_cents * vat_rate / 100.0).round
  def total_cents = amount_cents + vat_cents
  def offer_group = OFFER_GROUPS.fetch(category, "other")

  # For the team: everything. For the client (`client: true`): never who
  # noted it, and the receipt only of their own purchases.
  def as_json(client: false, viewer: nil, receipt_url: nil)
    json = {
      id:, mapId: map_id, spentOn: spent_on.iso8601, label:, supplier:, category:, phase:,
      amountCents: amount_cents, vatRate: vat_rate, vatCents: vat_cents, totalCents: total_cents,
      paidBy: paid_by, note:, source:, mine: viewer.present? && user_id == viewer.id,
      receipt: receipt.attached? ? { name: receipt.filename.to_s, contentType: receipt.content_type, url: receipt_url } : nil
    }
    return json.merge(userId: user_id, userName: user&.display_name) unless client
    json[:receipt] = nil unless json[:mine]
    json
  end

  private
    def spent_on_not_far_ahead
      errors.add(:spent_on, :future) if spent_on && spent_on > Date.current + 31
    end

    def receipt_kind
      return unless receipt.attached? && attachment_changes["receipt"]
      errors.add(:receipt, :content_type) unless RECEIPT_TYPES.include?(receipt.content_type)
      errors.add(:receipt, :too_big) if receipt.byte_size > MAX_RECEIPT_BYTES
    end
end
