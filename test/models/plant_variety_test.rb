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
end
