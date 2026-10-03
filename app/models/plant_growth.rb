# Where the growth inputs of a plant come from, and with what confidence:
# a garden simulated on defaults is not a garden simulated on measures, and
# the screen must be able to say so (« valeur indicative »).
#
# Cascade, from the most precise to the most general: variety, species,
# the species' growth rate, the strata default (always flagged as such).
#
# Logic ported from Terranova (PlantGrowth), sizes read in metres.
module PlantGrowth
  module_function

  MATURITY_BY_STRATA = {
    "canopy" => 25, "sub_canopy" => 12, "shrub" => 5, "herbaceous" => 2,
    "ground_cover" => 2, "vine" => 4, "root" => 2, "aquatic" => 3
  }.freeze

  PRODUCTION_BY_STRATA = {
    "canopy" => 8, "sub_canopy" => 5, "shrub" => 3, "herbaceous" => 2,
    "ground_cover" => 2, "vine" => 3, "root" => 2, "aquatic" => 2
  }.freeze

  SPREAD_BY_STRATA = {
    "canopy" => 8.0, "sub_canopy" => 4.0, "shrub" => 1.5, "herbaceous" => 0.6,
    "ground_cover" => 0.3, "vine" => 1.0, "root" => 0.4, "aquatic" => 0.8
  }.freeze

  HEIGHT_BY_STRATA = {
    "canopy" => 12.0, "sub_canopy" => 6.0, "shrub" => 2.5, "herbaceous" => 0.8,
    "ground_cover" => 0.2, "vine" => 4.0, "root" => 0.5, "aquatic" => 1.0
  }.freeze

  FAST = /rapid|fast/i
  SLOW = /lent|slow/i

  Resolution = Struct.new(:years, :source, keyword_init: true) do
    def indicative? = source != :variety && source != :species
  end

  Size = Struct.new(:metres, :source, keyword_init: true) do
    def indicative? = source != :species
  end

  def maturity(strata:, species: nil, variety: nil)
    resolve(strata:, species:, variety:, attribute: :maturity_years, defaults: MATURITY_BY_STRATA)
  end

  def production_start(strata:, species: nil, variety: nil)
    resolve(strata:, species:, variety:, attribute: :production_start_year, defaults: PRODUCTION_BY_STRATA)
  end

  # Adult spread (m): the mean of min and max, else the max, else the min,
  # else the strata default — and where it came from.
  def spread(strata:, species: nil)
    size(species&.spread_min_m, species&.spread_max_m, SPREAD_BY_STRATA.fetch(strata.to_s, 1.0))
  end

  def height(strata:, species: nil)
    size(species&.height_min_m, species&.height_max_m, HEIGHT_BY_STRATA.fetch(strata.to_s, 2.0))
  end

  def size(min, max, default)
    min = min&.to_f
    max = max&.to_f
    return Size.new(metres: ((min + max) / 2.0).round(2), source: :species) if min && max
    return Size.new(metres: max, source: :species) if max
    return Size.new(metres: min, source: :species) if min
    Size.new(metres: default, source: :strata_default)
  end

  def resolve(strata:, species:, variety:, attribute:, defaults:)
    from_variety = variety&.public_send(attribute)
    return Resolution.new(years: from_variety, source: :variety) if from_variety.to_i.positive?

    from_species = species&.public_send(attribute)
    return Resolution.new(years: from_species, source: :species) if from_species.to_i.positive?

    base = defaults.fetch(strata.to_s, 5)
    rate = species&.growth_rate.to_s
    return Resolution.new(years: [ (base * 0.7).round, 1 ].max, source: :growth_rate) if rate.match?(FAST)
    return Resolution.new(years: (base * 1.3).round, source: :growth_rate) if rate.match?(SLOW)

    Resolution.new(years: base, source: :strata_default)
  end
end
