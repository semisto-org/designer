# Planting density reference per strata (plants/m²). Two consumers: the
# density coherence alert (out of range) and the default quantity of a patch
# line (default density × patch area). Aquatic has no range: no alert,
# neutral default.
#
# Logic ported from Terranova (StrataDensity).
module StrataDensity
  RANGES = {
    "canopy" => 0.01..0.1,
    "sub_canopy" => 0.05..0.6,
    "shrub" => 0.2..2.0,
    "herbaceous" => 0.3..3.0,
    "ground_cover" => 3.0..12.0,
    "vine" => 0.02..0.2,
    "root" => 1.0..10.0
  }.freeze

  def self.range_for(strata) = RANGES[strata.to_s]

  # Default when a line has no density of its own: the GEOMETRIC middle of
  # the range (ranges span an order of magnitude, an arithmetic mean would
  # stick to the ceiling). canopy 0.03, sub_canopy 0.17, shrub 0.63,
  # herbaceous 0.95, ground_cover 6.0, vine 0.06, root 3.16, aquatic 1.0.
  def self.default_for(strata)
    range = RANGES[strata.to_s]
    return 1.0 unless range
    Math.sqrt(range.min * range.max).round(2)
  end

  # Spacing (m) between plants at a density: 1/√d.
  def self.spacing_m(density)
    d = density.to_f
    return nil unless d.positive?
    (1 / Math.sqrt(d)).round(2)
  end
end
