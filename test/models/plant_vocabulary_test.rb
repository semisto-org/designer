require "test_helper"

class PlantVocabularyTest < ActiveSupport::TestCase
  test "canonical keys from heterogeneous spellings" do
    assert_equal "sun", PlantVocabulary.canonical(:exposures, "S")
    assert_equal "sun", PlantVocabulary.canonical(:exposures, "Plein soleil")
    assert_equal "partial-shade", PlantVocabulary.canonical(:exposures, "Mi-ombre")
    assert_equal "self-sterile", PlantVocabulary.canonical(:fertility, "Autostérile")
    assert_equal "nitrogen", PlantVocabulary.canonical(:eco_services, "nitrogen-fixer")
    assert_equal "sub_canopy", PlantVocabulary.canonical(:strata, "tree")
    assert_nil PlantVocabulary.canonical(:exposures, "lune")
    assert_equal %w[fruit leaf], PlantVocabulary.canonical_list(:edible_parts, "fruits, jeunes feuilles, ???")
  end

  test "months" do
    assert_equal 9, PlantVocabulary.canonical_month("Septembre")
    assert_equal 9, PlantVocabulary.canonical_month("sep")
    assert_equal 8, PlantVocabulary.canonical_month("août")
    assert_equal 2, PlantVocabulary.canonical_month("2")
    assert_nil PlantVocabulary.canonical_month("13")
    assert_equal [ 4, 5, 6 ], PlantVocabulary.canonical_months([ "juin", "avril", 5, "mai" ])
    assert_equal "sep", PlantVocabulary.month_key(9)
  end

  test "hardiness zones and temperatures" do
    assert_equal 4, PlantVocabulary.canonical_zone("-25/-30°C (USDA 4)")
    assert_equal 5, PlantVocabulary.canonical_zone("zone-5")
    assert_equal 6, PlantVocabulary.canonical_zone("6b")
    assert_equal 7, PlantVocabulary.canonical_zone("-15°C")
    assert_nil PlantVocabulary.canonical_zone("rustique")
    assert_equal(-30.0, PlantVocabulary.canonical_min_temperature("-25/-30°C"))
    assert_equal 5, PlantVocabulary.zone_for_temperature(-25)
    assert_equal 8, PlantVocabulary.zone_for_temperature(-10)
    (1..13).each { |zone| assert_equal zone, PlantVocabulary.zone_for_temperature(PlantVocabulary.min_temperature_for_zone(zone)) }
  end

  test "binary input is read as UTF-8" do
    assert_equal "sun", PlantVocabulary.canonical(:exposures, "Soleil".b)
  end
end
