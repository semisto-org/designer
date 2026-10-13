# What a prospect sent through a professional's request form (RequestForm):
# who they are, their place (parcels or a pin) and first answers, and how
# far the team has taken it. Semisto's way: the request, a phone call, a
# visit on site, then the offer.
#
# The place and the answers stay here until someone of the team makes a
# map of it (ProjectRequests::MakeMap): a request never takes a map from
# anyone's plan, and spam never becomes a map.
class ProjectRequest < ApplicationRecord
  include GeoJsonGeometry

  STATUSES = %w[new called visited offer_sent accepted declined].freeze
  # Requests still waiting on the team, in the list's first group.
  OPEN_STATUSES = %w[new called visited offer_sent].freeze
  MAX_PHOTOS = 6
  PHOTO_MAX_BYTES = 15.megabytes
  MESSAGE_MAX_LENGTH = 4000

  # The answers, declared like the project sheet: the sheet's own questions
  # (who, budget, constraints) feed it when the map is made; services and
  # source are for the team.
  def self.sheet_field(section, key) = ProjectSheet.fields_for(section).find { _1.key == key }

  ANSWERS = [
    sheet_field("who", "profile"),
    TypedSchema.multi("services", *%w[design planting follow_up training advice]),
    TypedSchema.enum("budget", *sheet_field("budget", "initial").values),
    sheet_field("constraints", "water"),
    sheet_field("constraints", "access"),
    sheet_field("constraints", "slope"),
    TypedSchema.multi("source", *%w[word_of_mouth search social_media event training press other])
  ].freeze

  belongs_to :request_form
  belongs_to :map, optional: true
  belongs_to :region, optional: true
  has_many_attached :photos

  normalizes :email, with: ->(e) { e.to_s.strip.downcase }
  normalizes :name, :phone, :address, :decline_note, with: ->(v) { v.to_s.squish.presence }

  validates :name, presence: true, length: { maximum: 120 }
  validates :email, presence: true, length: { maximum: 200 }, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :phone, length: { maximum: 40 }
  validates :address, length: { maximum: 300 }
  validates :message, length: { maximum: MESSAGE_MAX_LENGTH }
  validates :team_notes, length: { maximum: 10_000 }
  validates :decline_note, length: { maximum: 300 }
  validates :status, inclusion: { in: STATUSES }
  validate :photos_are_acceptable

  before_save -> { self.status_changed_at = Time.current }, if: :will_save_change_to_status?

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def self.answers_schema = { fields: ANSWERS.map(&:as_json) }

  # Strict parsing of the prospect's answers: [values, errors].
  def self.parse_answers(raw)
    coercer = TypedSchema::Coercer.new(strict: true)
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    values = coercer.hash(ANSWERS, raw || {}, "answers") || {}
    [ values.compact, coercer.errors ]
  end

  def open? = OPEN_STATUSES.include?(status)

  # What the request already says for the map's project sheet.
  def project_patch
    people = [ { "name" => name, "role" => "lead" } ]
    {
      "who" => { "people" => people, "profile" => answers["profile"] }.compact,
      "budget" => { "initial" => answers["budget"] }.compact.presence,
      "constraints" => answers.slice("water", "access", "slope").compact.presence,
      "ambitions" => (message.present? ? { "notes" => message.first(2000) } : nil)
    }.compact
  end

  private
    def photos_are_acceptable
      return unless photos.attached?
      errors.add(:photos, :too_many, count: MAX_PHOTOS) if photos.size > MAX_PHOTOS
      photos.each do |photo|
        next if MapPhoto::UPLOAD_TYPES.include?(photo.content_type) && photo.byte_size <= PHOTO_MAX_BYTES
        errors.add(:photos, :invalid)
        break
      end
    end
end
