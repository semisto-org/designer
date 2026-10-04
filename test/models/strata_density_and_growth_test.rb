require "test_helper"

class StrataDensityAndGrowthTest < ActiveSupport::TestCase
  test "strata density defaults are geometric means" do
    assert_equal 0.03, StrataDensity.default_for("canopy")
    assert_equal 0.63, StrataDensity.default_for("shrub")
    assert_equal 6.0, StrataDensity.default_for("ground_cover")
    assert_equal 1.0, StrataDensity.default_for("aquatic")
    assert_nil StrataDensity.range_for("aquatic")
    assert_equal 1.0, StrataDensity.spacing_m(1)
    assert_nil StrataDensity.spacing_m(0)
  end

  test "growth model golden values" do
    assert_in_delta 0.5883, GrowthModel.maturity_fraction(5, 10), 0.0001
    assert_equal 1.0, GrowthModel.maturity_fraction(10, 10)
    assert_equal 0.0, GrowthModel.maturity_fraction(0, 10)
    assert_in_delta 2.0, GrowthModel.canopy_radius_m(year: 20, maturity_years: 10, adult_spread_m: 4), 0.001
    assert_equal "open", GrowthModel.cover_state(0.1)
    assert_equal "closed", GrowthModel.cover_state(0.9)
  end

  test "growth cascade: variety, species, growth rate, strata" do
    assert_equal :strata_default, PlantGrowth.maturity(strata: "shrub").source
    fast = PlantSpecies.new(growth_rate: "fast")
    assert_equal 4, PlantGrowth.maturity(strata: "shrub", species: fast).years
    assert_equal :species, PlantGrowth.maturity(strata: "shrub", species: PlantSpecies.new(maturity_years: 7)).source
    assert_equal :variety, PlantGrowth.maturity(strata: "shrub", variety: PlantVariety.new(maturity_years: 3)).source
  end
end
