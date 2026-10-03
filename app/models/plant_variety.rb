# A cultivar of a species (Malus domestica 'Reinette d'Orléans').
class PlantVariety < ApplicationRecord
  include FieldProvenance
  include CommonNamed
  provenanced_fields :fertility, :taste_rating, :productivity, :ripening, :disease_resistance,
                     :maturity_years, :production_start_year, :common_names

  belongs_to :species, class_name: "PlantSpecies", inverse_of: :varieties

  normalizes :name, with: ->(n) { n.to_s.squish.delete_prefix("'").delete_suffix("'") }

  validates :name, presence: true, length: { maximum: 120 }
  validates :name, uniqueness: { scope: :species_id, case_sensitive: false }
  validates :fertility, inclusion: { in: PlantVocabulary.keys(:fertility) }, allow_nil: true
  validates :taste_rating, inclusion: { in: 1..5 }, allow_nil: true
  validates :maturity_years, :production_start_year, numericality: { only_integer: true, greater_than: 0, less_than: 200 }, allow_nil: true

  # The full latin name: "Malus domestica 'Reinette d'Orléans'", unless the
  # name already starts with the genus.
  def full_latin_name
    genus_word = species.latin_name.split.first.to_s.downcase
    return name if name.downcase.start_with?("#{genus_word} ")
    "#{species.latin_name} '#{name}'"
  end

  def summary_json
    { id:, speciesId: species_id, name:, latinName: full_latin_name, commonName: common_name }
  end

  def sheet_json
    summary_json.merge(
      fertility:, tasteRating: taste_rating, productivity:, ripening:, diseaseResistance: disease_resistance,
      maturityYears: maturity_years, productionStartYear: production_start_year,
      provenance: provenance_json
    )
  end
end
