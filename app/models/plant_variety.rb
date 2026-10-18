# A cultivar of a species (Malus domestica 'Reinette d'Orléans').
class PlantVariety < ApplicationRecord
  include FieldProvenance
  include CommonNamed
  provenanced_fields :fertility, :taste_rating, :productivity, :ripening, :disease_resistance,
                     :maturity_years, :production_start_year, :common_names,
                     :uses, :picking_month, :eating_from_month, :eating_until_month

  # What the fruit is good for. A harvest line says what was done with it
  # (PlantHarvest::USES); this says what the variety is known to be good for.
  USES = %w[fresh cooking juice cider drying].freeze
  MONTHS = (1..12)

  belongs_to :species, class_name: "PlantSpecies", inverse_of: :varieties

  normalizes :uses, with: ->(uses) { Array(uses).map(&:to_s).compact_blank.uniq & USES }
  normalizes :name, with: ->(n) { n.to_s.squish.delete_prefix("'").delete_suffix("'") }

  validates :name, presence: true, length: { maximum: 120 }
  validates :name, uniqueness: { scope: :species_id, case_sensitive: false }
  validates :fertility, inclusion: { in: PlantVocabulary.keys(:fertility) }, allow_nil: true
  validates :taste_rating, inclusion: { in: 1..5 }, allow_nil: true
  validates :picking_month, :eating_from_month, :eating_until_month, inclusion: { in: MONTHS }, allow_nil: true
  validates :maturity_years, :production_start_year, numericality: { only_integer: true, greater_than: 0, less_than: 200 }, allow_nil: true

  # The full latin name: "Malus domestica 'Reinette d'Orléans'", unless the
  # name already starts with the genus.
  def full_latin_name
    genus_word = species.latin_name.split.first.to_s.downcase
    return name if name.downcase.start_with?("#{genus_word} ")
    "#{species.latin_name} '#{name}'"
  end

  # The cultivar of this species by that name, accents, case, hyphens and
  # quotes aside ('Belle-fleur double' is 'Belle fleur double'), or a new one.
  # Someone who finds a cultivar missing adds it from the palette; only its
  # name enters the catalogue, its values stay empty until sourced.
  def self.find_or_create_named!(species, name)
    name = name.to_s.squish.delete_prefix("'").delete_suffix("'").squish
    species.varieties.detect { |v| fold(v.name) == fold(name) } || species.varieties.create!(name:)
  end

  # The cultivars a search names, per species: the ones the query says more
  # about than the species does (« pommier belle fleur » names 'Belle fleur
  # double', « pommier » alone names none). At most `limit` per species.
  def self.named_in(species_list, query, limit: 6)
    words = PlantSpecies.search_words(query).map { |w| fold(w) }
    return {} if words.empty?
    species_list = Array(species_list)
    varieties = where(species_id: species_list.map(&:id)).includes(:common_names).order(:name).group_by(&:species_id)
    species_list.each_with_object({}) do |species, found|
      species_text = fold([ species.latin_name, *species.common_names.map(&:name) ].join(" "))
      named = varieties.fetch(species.id, []).select do |variety|
        text = fold([ variety.name, *variety.common_names.map(&:name) ].join(" "))
        words.all? { |w| text.include?(w) || species_text.include?(w) } && words.any? { |w| text.include?(w) && !species_text.include?(w) }
      end
      found[species.id] = named.first(limit) if named.any?
    end
  end

  def self.fold(text) = I18n.transliterate(text.to_s).downcase.gsub(/[\s'’\-]+/, " ").squish

  def summary_json
    { id:, speciesId: species_id, name:, latinName: full_latin_name, commonName: common_name }
  end

  def sheet_json
    summary_json.merge(
      fertility:, tasteRating: taste_rating, productivity:, ripening:, diseaseResistance: disease_resistance,
      maturityYears: maturity_years, productionStartYear: production_start_year,
      uses:, pickingMonth: picking_month, eatingFromMonth: eating_from_month, eatingUntilMonth: eating_until_month,
      provenance: provenance_json
    )
  end

  # Keeps at least this many months after picking: a keeping variety.
  KEEPER_MONTHS = 3

  # How long the fruit keeps: keeps (cellar until eating_until), weeks (a
  # few weeks), short (eat or cook soon), or nil when unknown.
  def keeping
    months = keeping_months
    return nil if months.nil?
    if months >= KEEPER_MONTHS then "keeps"
    elsif months >= 1 then "weeks"
    else "short"
    end
  end

  # What the advice needs, with the provenance of each value.
  def uses_json
    {
      id:, name:, uses:, keeping:,
      pickingMonth: picking_month, eatingFromMonth: eating_from_month, eatingUntilMonth: eating_until_month,
      provenance: provenance_json.slice("uses", "pickingMonth", "eatingFromMonth", "eatingUntilMonth")
    }
  end

  # Months the fruit keeps after picking, counted across the new year
  # (picked in October, eaten until March: 5). Nil when unknown.
  def keeping_months
    return nil unless picking_month && eating_until_month
    (eating_until_month - picking_month) % 12
  end
end
