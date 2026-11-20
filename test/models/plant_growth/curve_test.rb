require "test_helper"

# The Ruby port of the browser's growth curve (relief/growth.ts) gives the
# same sizes, case by case, as the cases generated from the TypeScript.
class PlantGrowth::CurveTest < ActiveSupport::TestCase
  CASES = JSON.parse(Rails.root.join("test/fixtures/files/growth_curve_cases.json").read)["cases"]

  test "every shared case gives the browser's size" do
    assert_operator CASES.size, :>=, 100
    CASES.each do |example|
      input = example["input"]
      form = PlantGrowth::Curve.form(input["strata"], input["plantType"])
      training = PlantGrowth::Curve.training(form, input["training"])
      graft = training == "free" ? PlantGrowth::Curve.graft(form, input["graft"]&.symbolize_keys) : nil
      size = PlantGrowth::Curve.size_at(
        strata: input["strata"], height: input["heightM"], spread: input["spreadM"], maturity: input["maturityYears"],
        age: input["age"], training:, graft:, until_years: input["until"], measured: input["measured"]&.symbolize_keys
      )
      expected = example["expected"]
      if expected.nil?
        assert_nil size, input.inspect
      else
        assert_in_delta expected["height"], size[:height], 1e-5, input.inspect
        assert_in_delta expected["spread"], size[:spread], 1e-5, input.inspect
      end
    end
  end

  test "a tree grows slowly, then fast, then levels off at its adult size" do
    sizes = [ 1, 5, 15, 30 ].map { |age| PlantGrowth::Curve.size_at(strata: "canopy", height: 25, spread: 15, maturity: 25, age:)[:spread] }
    assert_equal sizes, sizes.sort
    assert_in_delta 15, PlantGrowth::Curve.size_at(strata: "canopy", height: 25, spread: 15, maturity: 25, age: 60)[:spread], 0.01
  end

  test "a measure on the tree gives the size; the planting date gives its age" do
    measured = PlantGrowth::Curve.measured({ height: 6.0, crown: nil, girth: 40, on: "2026-01-01" }, planted_on: Date.new(2016, 1, 1))
    assert_in_delta 10, measured[:age], 0.01
    assert_nil PlantGrowth::Curve.measured({ height: nil, crown: nil, girth: 40, on: "2026-01-01" })
    old = PlantGrowth::Curve.measured({ height: 18.0, crown: 17.0, girth: 470, on: "2026-11-21" })
    assert_nil old[:age]
    size = PlantGrowth::Curve.size_at(strata: "canopy", height: 22.5, spread: 12.5, maturity: 30, age: 1000, measured: old)
    assert_in_delta 18, size[:height], 1e-6
    assert_in_delta 17, size[:spread], 1e-6
  end
end
