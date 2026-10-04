# Growth model of a planting, assumed SIMPLE and always shown as indicative:
# it answers « what will this patch look like in 8 years? », not « how many
# kilos exactly ».
#   - maturity fraction: logistic k=5.2, c=0.42 over the years to maturity
#   - crown radius: (adult spread / 2) × fraction
#   - patch cover: 1 − exp(−Σ density·π·r²) (Poisson overlap)
#
# Logic ported from Terranova (GrowthModel). Golden values:
# maturity_fraction(5, 10) = 0.5883, (10, 10) = 1.0.
module GrowthModel
  module_function

  K = 5.2
  C = 0.42

  # Share of the adult size reached at `year`, bounded to [0, 1].
  def maturity_fraction(year, maturity_years)
    years = maturity_years.to_f
    return 0.0 if year.to_f <= 0 || years <= 0

    t = year.to_f / years
    raw = 1.0 / (1.0 + Math.exp(-K * (t - C)))
    # At t=0 the logistic is already ~0.09: remove that floor so a garden
    # planted yesterday is at zero, and renormalise on t=1.
    at_zero = 1.0 / (1.0 + Math.exp(K * C))
    at_one = 1.0 / (1.0 + Math.exp(-K * (1 - C)))
    ((raw - at_zero) / (at_one - at_zero)).clamp(0.0, 1.0)
  end

  # Crown radius (m) at a given year.
  def canopy_radius_m(year:, maturity_years:, adult_spread_m:)
    (adult_spread_m.to_f / 2.0) * maturity_fraction(year, maturity_years)
  end

  # Cover of a patch: 1 − exp(−Σ density·π·r²), densities in plants/m², radii
  # in metres. `specimens` = [{ density:, maturity_years:, spread_m: }].
  def patch_cover(year:, specimens:)
    sum = specimens.sum do |s|
      r = canopy_radius_m(year: year, maturity_years: s[:maturity_years], adult_spread_m: s[:spread_m])
      s[:density].to_f * Math::PI * (r**2)
    end
    return 0.0 if sum <= 0
    (1.0 - Math.exp(-sum)).clamp(0.0, 1.0)
  end

  # Global cover, weighted by areas. `patches` = [{ area_m2:, cover: }].
  def global_cover(patches)
    total = patches.sum { |p| p[:area_m2].to_f }
    return 0.0 if total <= 0
    patches.sum { |p| p[:area_m2].to_f * p[:cover].to_f } / total
  end

  # open (< 30 %), closing (< 65 %), almost_closed (< 85 %), closed.
  def cover_state(cover)
    percent = cover.to_f * 100
    return "open" if percent < 30
    return "closing" if percent < 65
    return "almost_closed" if percent < 85
    "closed"
  end
end
