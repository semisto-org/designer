require "test_helper"

class HarvestAdviceTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @variety = plant_varieties(:reinette)
    @variety.update!(uses: %w[fresh cooking], picking_month: 10, eating_from_month: 12, eating_until_month: 3)
    @tree = plant(name: "n° 7", variety: @variety)
    @other = plant(name: "n° 9", variety: @variety)
  end

  test "what the variety is good for and how long it keeps" do
    advice = HarvestAdvice.new(@map, @tree).as_json
    assert_equal %w[fresh cooking], advice[:variety][:uses]
    assert_equal "keeps", advice[:keeping]
    assert advice[:ripensInStore], "picked in October, good from December"
  end

  test "what this place did with the variety, all its trees together" do
    @other.plant_harvests.create!(noted_on: Date.new(2026, 10, 12), stage: "picked", uses: %w[juice], note: "Très bon jus")
    @tree.plant_harvests.create!(noted_on: Date.new(2025, 10, 1), stage: "picked", uses: %w[juice cooking])
    @tree.plant_harvests.create!(noted_on: Date.new(2026, 7, 1), stage: "on_tree", amount: "normal", note: "Pas une récolte")

    here = HarvestAdvice.new(@map, @tree).as_json[:here]
    assert_equal 2, here[:picked]
    assert_equal({ "juice" => 2, "cooking" => 1 }, here[:uses])
    assert_equal [ "Très bon jus" ], here[:notes].map { _1[:note] }
    assert_equal "n° 9", here[:notes].first[:plant]
  end

  test "a plant without variety gets its own history and no catalogue advice" do
    tree = plant(name: "n° 84")
    advice = HarvestAdvice.new(@map, tree).as_json
    assert_nil advice[:variety]
    assert_nil advice[:keeping]
    assert_equal 0, advice[:here][:picked]
  end

  private
    def plant(name:, variety: nil)
      properties = { "species_id" => plant_species(:apple).id, "variety_id" => variety&.id }.compact
      @map.features.create!(layer: "plants", kind: "plant", name:, geometry: RGeo::Geographic.spherical_factory(srid: 4326).point(4.97, 50.33), properties:)
    end
end
