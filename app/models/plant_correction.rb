# A correction someone suggests for a species of the shared catalogue: one
# field, the value they propose (or only a note, for « autre chose »), and
# where they read it. From the species sheet (« Suggérer une correction ») or
# from their AI through the MCP (suggest_plant_correction). A catalogue
# reviewer accepts it (the value is written « to verify », citing the page
# when there is one) or rejects it; nothing changes in the catalogue before.
class PlantCorrection < ApplicationRecord
  # What a correction can change, and how its value is read.
  SINGLE_FIELDS = %w[strata plant_type life_cycle foliage_type].freeze
  NUMBER_FIELDS = %w[height_max_m spread_max_m].freeze
  FIELDS = [ "common_name", *SINGLE_FIELDS, *NUMBER_FIELDS, "hardiness_zone", "other" ].freeze
  STATUSES = %w[pending accepted rejected].freeze
  ORIGINS = %w[web ai].freeze

  belongs_to :species, class_name: "PlantSpecies", inverse_of: :corrections
  belongs_to :user
  belongs_to :reviewed_by, class_name: "User", optional: true

  validates :field, inclusion: { in: FIELDS }
  validates :status, inclusion: { in: STATUSES }
  validates :origin, inclusion: { in: ORIGINS }
  validates :note, length: { maximum: 2000 }
  validates :source_url, length: { maximum: 500 }, format: { with: %r{\Ahttps?://\S+\z} }, allow_blank: true
  validate :value_fits_field

  before_validation :read_value
  before_create { self.current_value = self.class.value_of(species, field) }

  scope :pending, -> { where(status: "pending") }

  def self.keys_for(field) = field == "strata" ? PlantVocabulary::STRATA : PlantVocabulary.keys(field.to_sym)

  # The species' value for a field, as a correction stores it.
  def self.value_of(species, field)
    case field
    when "common_name" then species.common_name
    when "other" then nil
    else species.public_send(field).then { _1.is_a?(BigDecimal) ? _1.to_f : _1 }
    end
  end

  def pending? = status == "pending"

  # Writes the value into the catalogue (« to verify », by this person, citing
  # the page) and closes the correction. A note alone changes nothing: the
  # reviewer corrects the sheet by hand, then accepts it to close it.
  def accept!(reviewer)
    transaction do
      apply! unless field == "other"
      update!(status: "accepted", reviewed_by: reviewer, reviewed_at: Time.current)
    end
  end

  def reject!(reviewer) = update!(status: "rejected", reviewed_by: reviewer, reviewed_at: Time.current)

  def as_json(*)
    {
      id:, field:, currentValue: current_value, proposedValue: proposed_value, note:, sourceUrl: source_url.presence,
      origin:, status:, suggestedBy: user.display_name, suggestedAt: created_at.iso8601,
      species: { id: species.id, latinName: species.latin_name, commonName: species.common_name, slug: species.to_param }
    }
  end

  private
    def read_value
      self.proposed_value = nil if field == "other"
      self.proposed_value = proposed_value.to_s.squish.presence if field == "common_name"
      if NUMBER_FIELDS.include?(field)
        self.proposed_value = Float(proposed_value.to_s.tr(",", "."), exception: false)
      elsif field == "hardiness_zone"
        self.proposed_value = Integer(proposed_value.to_s.strip, exception: false)
      end
    end

    def value_fits_field
      return errors.add(:note, :blank) if field == "other" && note.blank?
      return if field == "other" || !FIELDS.include?(field)
      ok = case field
      when "common_name" then proposed_value.is_a?(String) && proposed_value.length <= 120
      when *SINGLE_FIELDS then self.class.keys_for(field).include?(proposed_value)
      when *NUMBER_FIELDS then proposed_value.is_a?(Float) && proposed_value.positive? && proposed_value < 200
      when "hardiness_zone" then proposed_value.is_a?(Integer) && proposed_value.between?(1, 13)
      end
      errors.add(:proposed_value, :invalid) unless ok
    end

    def apply!
      writer = Catalog::SpeciesWriter.new(source: "user", status: "to_verify", url: source_url.presence)
      if field == "common_name"
        names = [ proposed_value, *species.common_names.select { _1.language == "fr" }.map(&:name) ]
        writer.write(species, {}, common_names: names)
      else
        # A correction a reviewer accepts replaces even a checked value: the
        # reviewer is the one who decides.
        species.field_sources.where(field:).delete_all if species.provenance_for(field)&.status == "sourced"
        species.field_sources.reset
        writer.write(species, { field => proposed_value })
      end
    end
end
