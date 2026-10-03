# A species (or one of its cultivars) chosen for a map: the strata it plays
# on this design, its role, notes and how many plants are aimed at.
#
# Strata, roles and the « one entry per species or cultivar » rule follow
# Terranova's PaletteItem / PaletteAddition.
class PaletteItem < ApplicationRecord
  STRATA = PlantVocabulary::STRATA
  ROLES = %w[food support pioneer hedge ornamental].freeze

  belongs_to :map, touch: true
  belongs_to :species, class_name: "PlantSpecies", inverse_of: :palette_items
  belongs_to :variety, class_name: "PlantVariety", optional: true
  belongs_to :created_by, class_name: "User", optional: true

  validates :strata, inclusion: { in: STRATA }, allow_nil: true
  validates :role, inclusion: { in: ROLES }, allow_nil: true
  validates :target_count, numericality: { only_integer: true, greater_than: 0, less_than: 1_000_000 }, allow_nil: true
  validates :notes, length: { maximum: 2000 }
  validates :species_id, uniqueness: { scope: :map_id, conditions: -> { where(variety_id: nil) } }, if: -> { variety_id.nil? }
  validates :variety_id, uniqueness: { scope: :map_id }, allow_nil: true
  validate :variety_of_species

  normalizes :strata, :role, with: ->(v) { v.presence }

  before_create { self.position = (map.palette_items.maximum(:position) || 0) + 1 if position.zero? }

  def effective_strata = strata.presence || species.default_strata
  def key = [ species_id, variety_id ]

  def display_name
    variety ? (variety.common_name || "#{species.common_name || species.latin_name} '#{variety.name}'") : (species.common_name || species.latin_name)
  end

  def as_json(*)
    {
      id:, speciesId: species_id, varietyId: variety_id, strata:, effectiveStrata: effective_strata,
      role:, notes:, targetCount: target_count, position:,
      name: display_name, latinName: variety&.full_latin_name || species.latin_name,
      species: species.summary_json, variety: variety&.summary_json
    }
  end

  private
    def variety_of_species
      errors.add(:variety, :invalid) if variety && variety.species_id != species_id
    end
end
