# A botanical species: the heart of the catalogue. Values are stored in map
# units (metres, °C, months 1..12) and canonical vocabulary keys
# (PlantVocabulary); each one carries its provenance (FieldProvenance).
#
# Hardiness is normalised: `hardiness_zone` (USDA 1..13) and
# `min_temperature_c` (the coldest absolute minimum the plant survives).
# When only one is known, the other is derived from it.
class PlantSpecies < ApplicationRecord
  self.table_name = "plant_species"

  include FieldProvenance

  SINGLE_FACETS = %i[plant_type strata foliage_type life_cycle growth_rate root_system fertility soil_richness].freeze
  LIST_FACETS = %i[exposures soil_moisture soil_types soil_ph edible_parts eco_services toxic_for].freeze
  MONTH_FIELDS = %i[flowering_months fruiting_months harvest_months pruning_months].freeze
  SIZE_FIELDS = %i[height_min_m height_max_m spread_min_m spread_max_m].freeze
  RATING_FIELDS = %i[watering_need edible_rating medicinal_rating].freeze
  COUNTRY_FIELDS = %i[native_countries invasive_countries].freeze
  YEAR_FIELDS = %i[maturity_years production_start_year].freeze

  provenanced_fields :common_names, *SINGLE_FACETS, *LIST_FACETS, *MONTH_FIELDS, *SIZE_FIELDS, *RATING_FIELDS,
                     *COUNTRY_FIELDS, *YEAR_FIELDS, :hardiness_zone, :min_temperature_c

  # Strata a plant plays by default, from its habit (a designer adjusts it
  # per map in the palette).
  STRATA_BY_PLANT_TYPE = {
    "tree" => "canopy", "shrub" => "shrub", "small-shrub" => "shrub", "herbaceous" => "herbaceous",
    "climber" => "vine", "ground-cover" => "ground_cover", "aquatic" => "aquatic"
  }.freeze

  belongs_to :genus, class_name: "PlantGenus", optional: true, inverse_of: :species
  has_many :varieties, -> { order(Arel.sql("lower(plant_varieties.name)")) }, class_name: "PlantVariety",
           foreign_key: :species_id, inverse_of: :species, dependent: :destroy
  has_many :common_names, -> { order(:position, :id) }, class_name: "PlantCommonName", as: :nameable, dependent: :delete_all
  has_many :palette_items, foreign_key: :species_id, inverse_of: :species, dependent: :restrict_with_error
  has_many :observations, class_name: "PlantObservation", foreign_key: :species_id, inverse_of: :species, dependent: :nullify

  normalizes :latin_name, with: ->(n) { n.to_s.squish.sub(/\A(\p{L})/) { $1.upcase } }
  normalizes :native_countries, :invasive_countries, with: ->(codes) { Array(codes).map { |c| c.to_s.upcase }.uniq.sort }

  validates :latin_name, presence: true, length: { maximum: 120 }, uniqueness: { case_sensitive: false }
  SINGLE_FACETS.each do |facet|
    keys = facet == :strata ? PlantVocabulary::STRATA : PlantVocabulary.keys(facet)
    validates facet, inclusion: { in: keys }, allow_nil: true
  end
  validate :list_facets_are_canonical
  validate :months_are_valid
  validates(*SIZE_FIELDS, numericality: { greater_than: 0, less_than: 200 }, allow_nil: true)
  validates(*RATING_FIELDS, inclusion: { in: 1..5 }, allow_nil: true)
  validates :hardiness_zone, inclusion: { in: 1..13 }, allow_nil: true
  validates :min_temperature_c, numericality: { greater_than: -70, less_than: 25 }, allow_nil: true
  validates(*YEAR_FIELDS, numericality: { only_integer: true, greater_than: 0, less_than: 200 }, allow_nil: true)
  validate :countries_are_codes

  before_validation :complete_hardiness
  before_validation :sort_months

  scope :alphabetical, -> { order(Arel.sql("lower(plant_species.latin_name)")) }
  scope :with_card_data, -> { includes(:common_names) }

  # Latin name, common names, cultivar names: accents and case ignored.
  scope :matching, ->(query) {
    term = query.to_s.squish
    next all if term.blank?
    pattern = "%#{sanitize_sql_like(term)}%"
    names = PlantCommonName.where(nameable_type: "PlantSpecies").where("unaccent(plant_common_names.name) ILIKE unaccent(?)", pattern).select(:nameable_id)
    variety_names = PlantCommonName.where(nameable_type: "PlantVariety").where("unaccent(plant_common_names.name) ILIKE unaccent(?)", pattern).select(:nameable_id)
    varieties = PlantVariety.where("unaccent(plant_varieties.name) ILIKE unaccent(?)", pattern).or(PlantVariety.where(id: variety_names)).select(:species_id)
    where("unaccent(plant_species.latin_name) ILIKE unaccent(?)", pattern).or(where(id: names)).or(where(id: varieties))
  }

  def self.find_by_latin_name(latin_name)
    where("lower(latin_name) = ?", latin_name.to_s.squish.downcase).first
  end

  def self.default_strata_for(plant_type) = STRATA_BY_PLANT_TYPE[plant_type.to_s]

  def to_param = [ id, latin_name.parameterize ].join("-")

  def common_name(language = "fr")
    common_names.detect { |n| n.language == language }&.name
  end

  def default_strata = strata.presence || self.class.default_strata_for(plant_type) || "shrub"

  def nitrogen_fixer? = eco_services.include?("nitrogen")
  def melliferous? = eco_services.include?("mellifere")
  def edible? = edible_rating.present? || edible_parts.any?
  def native_in?(country) = country.present? && native_countries.include?(country.to_s.upcase)
  def invasive_in?(country) = country.present? && invasive_countries.include?(country.to_s.upcase)
  def woody? = %w[tree shrub small-shrub climber].include?(plant_type)

  # Adult crown and height (m), with the strata default when unknown.
  def adult_spread(strata = default_strata) = PlantGrowth.spread(strata:, species: self)
  def adult_height(strata = default_strata) = PlantGrowth.height(strata:, species: self)

  # Replaces the common names of one language, keeping their order.
  def replace_common_names!(names, language: "fr")
    names = Array(names).map { |n| n.to_s.squish }.reject(&:blank?).uniq { |n| n.downcase }
    transaction do
      common_names.where(language:).delete_all
      names.each_with_index { |name, i| common_names.create!(language:, name:, position: i) }
    end
    common_names.reset
  end

  # Compact form for cards, the palette and the map overlay.
  def summary_json
    spread = adult_spread
    {
      id:, latinName: latin_name, commonName: common_name, slug: to_param,
      plantType: plant_type, strata: default_strata, foliageType: foliage_type,
      heightMaxM: height_max_m&.to_f, spreadMaxM: spread_max_m&.to_f,
      crownM: spread.metres, crownIndicative: spread.indicative?,
      hardinessZone: hardiness_zone, minTemperatureC: min_temperature_c&.to_f,
      exposures:, soilMoisture: soil_moisture, edibleParts: edible_parts, ecoServices: eco_services,
      edibleRating: edible_rating, nativeCountries: native_countries, invasiveCountries: invasive_countries,
      harvestMonths: harvest_months
    }
  end

  # Everything the species sheet shows, with the provenance of each value.
  def sheet_json
    summary_json.merge(
      genus: genus&.latin_name,
      commonNames: common_names.select { |n| n.language == "fr" }.map(&:name),
      lifeCycle: life_cycle, growthRate: growth_rate, rootSystem: root_system, fertility:,
      heightMinM: height_min_m&.to_f, spreadMinM: spread_min_m&.to_f,
      soilTypes: soil_types, soilPh: soil_ph, soilRichness: soil_richness,
      wateringNeed: watering_need, medicinalRating: medicinal_rating,
      floweringMonths: flowering_months, fruitingMonths: fruiting_months, pruningMonths: pruning_months,
      toxicFor: toxic_for, maturityYears: maturity_years, productionStartYear: production_start_year,
      provenance: provenance_json,
      varieties: varieties.map(&:sheet_json)
    )
  end

  private
    def complete_hardiness
      if hardiness_zone.nil? && min_temperature_c.present?
        self.hardiness_zone = PlantVocabulary.zone_for_temperature(min_temperature_c)
      elsif min_temperature_c.nil? && hardiness_zone.present?
        self.min_temperature_c = PlantVocabulary.min_temperature_for_zone(hardiness_zone)
      end
    end

    def sort_months
      MONTH_FIELDS.each { |field| self[field] = Array(self[field]).map(&:to_i).uniq.sort }
    end

    def list_facets_are_canonical
      LIST_FACETS.each do |facet|
        unknown = Array(self[facet]) - PlantVocabulary.keys(facet)
        errors.add(facet, :inclusion) if unknown.any?
      end
    end

    def months_are_valid
      MONTH_FIELDS.each do |field|
        errors.add(field, :inclusion) unless Array(self[field]).all? { |m| m.is_a?(Integer) && m.between?(1, 12) }
      end
    end

    def countries_are_codes
      COUNTRY_FIELDS.each do |field|
        errors.add(field, :invalid) unless Array(self[field]).all? { |c| c.match?(/\A[A-Z]{2}\z/) }
      end
    end
end
