# A bio-indicator plant seen on the terrain, and how abundant it was. What it
# says about the soil comes from the curated list (SoilAnalysis::BioindicatorCatalog)
# through `catalog_key`; the plant may also point to the plant catalogue
# (`plant_species_id`, no foreign key: that table is built by another area and
# may not exist yet).
class BioindicatorObservation < ApplicationRecord
  include PointLocation

  ABUNDANCES = %w[rare present frequent dominant].freeze

  belongs_to :map
  belongs_to :observed_by, class_name: "User", optional: true

  before_validation :fill_from_catalog

  validates :species_name, presence: true, length: { maximum: 120 }
  validates :latin_name, length: { maximum: 160 }
  validates :abundance, inclusion: { in: ABUNDANCES }
  validates :notes, length: { maximum: 2000 }
  validate :catalog_key_is_known

  scope :recent, -> { order(Arel.sql("COALESCE(observed_on, created_at::date) DESC"), id: :desc) }

  def catalog_entry = catalog_key.present? ? SoilAnalysis::BioindicatorCatalog.find(catalog_key) : nil
  def indicators = catalog_entry&.fetch("indicates", []) || []
  def unverified_indicators = catalog_entry&.fetch("unverified", []) || []

  # The plant of the plant catalogue, when that catalogue exists.
  def plant_species
    return nil unless plant_species_id && defined?(::PlantSpecies)
    ::PlantSpecies.find_by(id: plant_species_id)
  rescue ActiveRecord::StatementInvalid, NameError
    nil
  end

  def as_inertia
    {
      id:, speciesName: species_name, latinName: latin_name, catalogKey: catalog_key,
      plantSpeciesId: plant_species_id, abundance:, observedOn: observed_on&.iso8601,
      lng:, lat:, notes:, indicators:, unverified: unverified_indicators, note: catalog_entry&.fetch("note", nil),
      provenance: catalog_entry&.fetch("provenance", nil),
      observedBy: observed_by&.display_name
    }
  end

  private
    def fill_from_catalog
      entry = catalog_entry or return
      self.species_name = entry["name"] if species_name.blank?
      self.latin_name = entry["latin"] if latin_name.blank?
    end

    def catalog_key_is_known
      errors.add(:catalog_key, :invalid) if catalog_key.present? && catalog_entry.nil?
    end
end
