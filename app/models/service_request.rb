# A request sent from a map to Semisto: quality plants from its nursery, an
# implementation on quote, or co-management of the place. The owner
# explicitly consents to Semisto looking at the map and contacting them;
# while the request is open, Semisto staff (admins) can read the map (see
# Map#role_for). Staff triage requests in /admin/requests.
class ServiceRequest < ApplicationRecord
  KINDS = %w[order_plants implementation co_management].freeze
  STATUSES = %w[new contacted closed].freeze
  DEFAULT_RECIPIENT = "designer@semisto.org".freeze

  # Typed payload of each kind: what the person tells Semisto.
  PAYLOADS = {
    "order_plants" => [
      TypedSchema.list("plants", [
        TypedSchema.text("name", limit: 120, required: true),
        TypedSchema.integer("quantity", 1..99_999),
        TypedSchema.integer("species_id", 1..2_000_000_000, hidden: true),
        TypedSchema.text("note", limit: 200)
      ], max: 300),
      TypedSchema.text("plants_free_text", limit: 4_000),
      TypedSchema.text("desired_period", limit: 120),
      TypedSchema.enum("delivery", *%w[pickup shipping either]),
      TypedSchema.text("commune", limit: 120),
      TypedSchema.text("phone", limit: 40),
      TypedSchema.text("message", limit: 3_000)
    ],
    "implementation" => [
      TypedSchema.integer("surface_m2", 1..100_000_000),
      TypedSchema.text("address", limit: 200),
      TypedSchema.text("commune", limit: 120),
      TypedSchema.text("desired_period", limit: 120),
      TypedSchema.enum("budget", *%w[under_2000 up_to_5000 up_to_10000 up_to_25000 over_25000 unknown]),
      TypedSchema.boolean("include_plant_list"),
      TypedSchema.list("plants", [
        TypedSchema.text("name", limit: 120, required: true),
        TypedSchema.integer("quantity", 1..99_999),
        TypedSchema.integer("species_id", 1..2_000_000_000, hidden: true),
        TypedSchema.text("note", limit: 200)
      ], max: 300),
      TypedSchema.text("phone", limit: 40),
      TypedSchema.text("message", limit: 3_000)
    ],
    "co_management" => [
      TypedSchema.multi("scope", *%w[maintenance pruning harvest monitoring replacement tasks]),
      TypedSchema.enum("frequency", *%w[seasonal monthly on_demand]),
      TypedSchema.text("desired_start", limit: 120),
      TypedSchema.enum("budget", *%w[under_500 up_to_1500 up_to_5000 over_5000 unknown]),
      TypedSchema.text("phone", limit: 40),
      TypedSchema.text("message", limit: 3_000)
    ]
  }.each_value(&:freeze).freeze

  belongs_to :map
  belongs_to :user
  belongs_to :handled_by, class_name: "User", optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validate :consent_given, on: :create
  validate :payload_matches_kind, if: -> { new_record? || will_save_change_to_payload? }

  before_validation :normalize_payload, if: -> { KINDS.include?(kind) && (new_record? || will_save_change_to_payload?) }
  before_create :capture_snapshot, :stamp_consent
  before_update :stamp_status_change, if: :will_save_change_to_status?
  after_create_commit :notify

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  # New or being handled: the consent to read the map holds.
  scope :pending, -> { where(status: %w[new contacted]) }

  # Who receives requests: SEMISTO_REQUESTS_EMAIL (comma separated list).
  def self.recipients
    list = ENV["SEMISTO_REQUESTS_EMAIL"].to_s.split(/[,;\s]+/).compact_blank
    list.presence || [ DEFAULT_RECIPIENT ]
  end

  def self.schema_json
    PAYLOADS.transform_values { |fields| fields.map(&:as_json) }
  end

  def pending? = status != "closed"

  def phone = payload["phone"]

  def as_member_json
    { id:, kind:, status:, createdAt: created_at.iso8601, contactedAt: contacted_at&.iso8601, closedAt: closed_at&.iso8601 }
  end

  def as_admin_json
    {
      **as_member_json,
      payload:, snapshot:, adminNotes: admin_notes, contactConsent: contact_consent,
      user: { id: user.id, name: user.display_name, email: user.email_address },
      handledBy: handled_by&.display_name,
      map: { id: map.id, name: map.name, address: map.address, areaM2: map.area_m2, archived: map.archived_at.present? }
    }
  end

  private
    def consent_given
      errors.add(:base, :consent_missing) unless contact_consent
    end

    # Strict coercion of the payload: only declared keys survive, the rest is
    # reported by #payload_matches_kind.
    def normalize_payload
      coercer = TypedSchema::Coercer.new(strict: true)
      cleaned = coercer.hash(PAYLOADS.fetch(kind), payload.presence || {}, "payload").compact
      @payload_errors = coercer.errors
      self.payload = cleaned
    end

    def payload_matches_kind
      @payload_errors&.each_key { |path| errors.add(:base, :invalid_field, field: path) }
      return if @payload_errors&.any? || !KINDS.include?(kind)
      case kind
      when "order_plants"
        errors.add(:base, :plants_missing) if payload["plants"].blank? && payload["plants_free_text"].blank?
      when "implementation"
        errors.add(:base, :location_missing) if payload["address"].blank? && payload["commune"].blank?
      when "co_management"
        errors.add(:base, :details_missing) if payload["scope"].blank? && payload["message"].blank?
      end
    end

    def capture_snapshot
      plants = map.features.active.where(layer: "plants").count
      self.snapshot = {
        "map_name" => map.name, "area_m2" => map.area_m2, "address" => map.address,
        "plants_count" => plants, "project_percent" => map.project_sheet.progress[:percent],
        "stage" => map.stage, "owner_name" => map.owner.display_name
      }
    end

    def stamp_consent
      self.consented_at ||= Time.current
    end

    def stamp_status_change
      self.contacted_at ||= Time.current if status == "contacted" || status == "closed"
      self.closed_at = status == "closed" ? Time.current : nil
    end

    def notify
      ServiceRequestMailer.received(self).deliver_later
      ServiceRequestMailer.confirmation(self).deliver_later
    end
end
