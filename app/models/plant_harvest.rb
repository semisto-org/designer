# One line of a plant's harvest log (a MapFeature of kind "plant"):
#   - stage "on_tree": what the tree carries (« porte des fruits »), noted in
#     the orchard before the harvest; amount none | light | normal | heavy;
#   - stage "picked": the harvest itself, with an optional amount and weight,
#     and where the fruit went (juice, cooking, fresh, storage, other).
# A season is the calendar year of `noted_on`.
class PlantHarvest < ApplicationRecord
  STAGES = %w[on_tree picked].freeze
  AMOUNTS = %w[none light normal heavy].freeze
  USES = %w[juice cooking fresh storage other].freeze
  NOTE_MAX_LENGTH = 2000

  belongs_to :map_feature
  belongs_to :map
  belongs_to :species, class_name: "PlantSpecies", optional: true
  belongs_to :variety, class_name: "PlantVariety", optional: true
  belongs_to :user, optional: true

  normalizes :uses, with: ->(uses) { Array(uses).map(&:to_s).compact_blank.uniq }

  validates :noted_on, presence: true
  validates :stage, inclusion: { in: STAGES }
  validates :amount, inclusion: { in: AMOUNTS }, allow_nil: true
  validates :amount, presence: true, if: :on_tree?
  validates :amount, exclusion: { in: %w[none] }, if: :picked?
  validates :quantity_kg, numericality: { greater_than: 0, less_than: 100_000 }, allow_nil: true
  validates :note, length: { maximum: NOTE_MAX_LENGTH }
  validate :uses_are_known
  validate :picked_details_only_when_picked
  validate :harvests_a_plant
  validate :not_in_the_future

  before_validation :copy_plant

  scope :chronological, -> { order(:noted_on, :id) }
  scope :newest_first, -> { order(noted_on: :desc, id: :desc) }
  scope :in_season, ->(year) { where(noted_on: Date.new(year, 1, 1)..Date.new(year, 12, 31)) }

  def on_tree? = stage == "on_tree"
  def picked? = stage == "picked"
  def season = noted_on.year

  # Did the plant bear fruit, according to this line? A harvest always says
  # yes; a look at the tree says yes unless it saw nothing.
  def bore? = picked? || amount != "none"

  def as_json(*)
    {
      id:, featureId: map_feature_id, notedOn: noted_on.iso8601, season:, stage:, amount:,
      quantityKg: quantity_kg&.to_f, uses:, note:,
      author: user&.display_name, createdAt: created_at&.iso8601
    }
  end

  private
    def copy_plant
      return unless map_feature
      self.map_id = map_feature.map_id
      self.species_id ||= map_feature.plant_species_id
      self.variety_id ||= map_feature.plant_variety_id
    end

    def uses_are_known
      errors.add(:uses, :inclusion) if (uses - USES).any?
    end

    def picked_details_only_when_picked
      return if picked?
      errors.add(:uses, :present) if uses.any?
      errors.add(:quantity_kg, :present) if quantity_kg
    end

    def harvests_a_plant
      if map_feature&.kind != PlantableFeature::PLANT
        errors.add(:map_feature, :invalid)
      elsif !map_feature.planted?
        errors.add(:base, :not_planted, plant: plant_label)
      end
    end

    def plant_label
      number = map_feature.properties["number"]
      name = map_feature.name.to_s.strip
      return name.presence || (number ? "n° #{number}" : "##{map_feature.id}") if number.nil? || name.empty? || name.start_with?("n°")
      "n° #{number} #{name}"
    end

    def not_in_the_future
      errors.add(:noted_on, :in_future) if noted_on && noted_on > PlantableFeature.latest_today
    end
end
