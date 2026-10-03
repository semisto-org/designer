# One line of a patch's composition: a species (or cultivar) planted at a
# density (plants/m²) or as a fixed count. The quantity of a density line is
# computed from the patch area measured by PostGIS, so it follows the patch
# when it is reshaped. Without a density of its own, a line uses its strata
# default (StrataDensity).
class PatchItem < ApplicationRecord
  belongs_to :map_feature, inverse_of: :patch_items
  belongs_to :map
  belongs_to :species, class_name: "PlantSpecies"
  belongs_to :variety, class_name: "PlantVariety", optional: true

  validates :strata, inclusion: { in: PlantVocabulary::STRATA }, allow_nil: true
  validates :density, numericality: { greater_than: 0, less_than: 1000 }, allow_nil: true
  validates :count, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than: 1_000_000 }, allow_nil: true
  validates :species_id, uniqueness: { scope: :map_feature_id, conditions: -> { where(variety_id: nil) } }, if: -> { variety_id.nil? }
  validates :variety_id, uniqueness: { scope: :map_feature_id }, allow_nil: true
  validate :belongs_to_a_patch
  validate :variety_of_species

  normalizes :strata, with: ->(v) { v.presence }

  before_validation { self.map_id = map_feature&.map_id }
  before_create { self.position = (map_feature.patch_items.maximum(:position) || 0) + 1 if position.zero? }

  def key = [ species_id, variety_id ]
  def counted? = count.present?

  # Strata of this line: its own, else the palette's, else the species'.
  def effective_strata(palette_strata = nil) = strata.presence || palette_strata.presence || species.default_strata

  def effective_density(palette_strata = nil) = density&.to_f || StrataDensity.default_for(effective_strata(palette_strata))

  # Plants of this line on a patch of `area_m2`: the count when given, else
  # density × area (at least one plant on a real surface).
  def quantity(area_m2, palette_strata = nil)
    return count if counted?
    return 0 if area_m2.to_f <= 0
    [ (effective_density(palette_strata) * area_m2.to_f).round, 1 ].max
  end

  private
    def belongs_to_a_patch
      errors.add(:map_feature, :invalid) unless map_feature&.kind == "patch"
    end

    def variety_of_species
      errors.add(:variety, :invalid) if variety && variety.species_id != species_id
    end
end
