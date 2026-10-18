require "test_helper"

class PlantVarietyTest < ActiveSupport::TestCase
  test "uses keep only the known ones, once" do
    variety = plant_varieties(:reinette)
    variety.update!(uses: [ "juice", "cooking", "juice", "jam", "" ])
    assert_equal %w[juice cooking], variety.uses
  end

  test "months are 1 to 12" do
    variety = plant_varieties(:reinette)
    variety.eating_until_month = 13
    refute variety.valid?
    assert variety.errors.of_kind?(:eating_until_month, :inclusion)
  end

  test "keeping counts the months across the new year" do
    variety = plant_varieties(:reinette)
    variety.assign_attributes(picking_month: 10, eating_until_month: 3)
    assert_equal 5, variety.keeping_months
    assert_equal "keeps", variety.keeping

    variety.eating_until_month = 11
    assert_equal "weeks", variety.keeping

    variety.assign_attributes(picking_month: 8, eating_until_month: 8)
    assert_equal "short", variety.keeping

    variety.eating_until_month = nil
    assert_nil variety.keeping
  end

  test "find_or_create_named! reuses a cultivar whatever its accents, case, hyphens or quotes" do
    apple = plant_species(:apple)
    assert_equal plant_varieties(:reinette), PlantVariety.find_or_create_named!(apple, "'reinette-GRISE'")
    assert_difference -> { apple.varieties.count }, 1 do
      created = PlantVariety.find_or_create_named!(apple, "  Belle fleur double ")
      assert_equal "Belle fleur double", created.name
      assert_equal created, PlantVariety.find_or_create_named!(apple, "Belle-Fleur double")
    end
  end

  test "named_in: the cultivars a search says more about than the species" do
    apple = plant_species(:apple)
    assert_equal [ plant_varieties(:reinette) ], PlantVariety.named_in([ apple ], "pommier grise")[apple.id]
    assert_equal [ plant_varieties(:boskoop) ], PlantVariety.named_in([ apple ], "belle")[apple.id]
    assert_nil PlantVariety.named_in([ apple ], "pommier")[apple.id], "the species alone names no cultivar"
  end
end
