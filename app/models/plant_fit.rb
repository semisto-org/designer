# How well a species suits a map: one verdict per criterion the site lets us
# judge, never a single score. A criterion reads « fits », « partial »,
# « misfit » or « unknown » (the catalogue does not say), and tells whether
# the value it rests on was checked against a source (`verified`) or still
# waits for a reviewer. Missing data is never taken for a good answer.
#
# What the site says comes from PlantFit::Site (climate, soil analyses,
# planting patches, project sheet). A criterion the site says nothing about
# is left out rather than guessed.
#
#   fit = PlantFit::Site.new(map).fit(species)
#   fit.tier        # => "fits" | "unknowns" | "one_misfit" | "misfits"
#   fit.criteria    # => [Criterion(key: "hardiness", status: "fits", ...)]
class PlantFit
  STATUSES = %w[fits partial misfit unknown].freeze
  TIERS = %w[fits unknowns one_misfit misfits].freeze

  # `field`: the catalogue field the verdict rests on (its provenance says
  # whether a human checked it); `site`: what the site says, as vocabulary
  # keys or a zone number.
  Criterion = Data.define(:key, :status, :field, :site, :verified) do
    def as_json(*) = { key:, status:, site:, verified: }
  end

  attr_reader :species, :criteria

  def initialize(species, criteria)
    @species = species
    @criteria = criteria
  end

  def misfits = criteria.count { |c| c.status == "misfit" }
  def unknowns = criteria.count { |c| c.status == "unknown" }

  def tier
    case misfits
    when 0 then unknowns.zero? ? "fits" : "unknowns"
    when 1 then "one_misfit"
    else "misfits"
    end
  end

  def rank = TIERS.index(tier)

  def as_json(*) = { tier:, criteria: criteria.map(&:as_json) }
end
