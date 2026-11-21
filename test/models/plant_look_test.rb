require "test_helper"

class PlantLookTest < ActiveSupport::TestCase
  test "the species' own values win, the others come from its genus, flagged as indicative" do
    walnut = PlantSpecies.new(latin_name: "Juglans regia")
    look = PlantLook.for(walnut)
    assert_equal({ value: "coarse", indicative: true }, look[:leaf_texture])
    assert_equal "silver", look[:bark_color][:value]
    walnut.bark_color = "dark"
    assert_equal({ value: "dark", indicative: false }, PlantLook.for(walnut)[:bark_color])
    assert_equal "dark", PlantLook.values(walnut)[:barkColor]
    assert_equal "light", PlantLook.values(walnut)[:crownDensity]
  end

  test "a species may differ from its genus, a cultivar named for its colour takes that tone" do
    assert_equal "white", PlantLook.guess("Betula pendula")[:bark_color]
    assert_equal "red_brown", PlantLook.guess("Betula nigra")[:bark_color]
    assert_equal "blue", PlantLook.guess("Prunus spinosa")[:fruit_color]
    assert_equal "red", PlantLook.guess("Prunus avium")[:fruit_color]
    assert_equal "purple", PlantLook.guess("Fagus sylvatica 'Purpurea'")[:foliage_tone]
    assert_equal "green", PlantLook.guess("Fagus sylvatica")[:foliage_tone]
    assert_equal "yellow_green", PlantLook.guess("Sambucus nigra 'Aurea'")[:foliage_tone]
    # An herb has no bark, and an unknown genus no look.
    assert_nil PlantLook.guess("Symphytum officinale")[:bark_color]
    assert_equal({}, PlantLook.guess("Plantus inconnus"))
    assert_equal({}, PlantLook.for(nil))
  end

  test "every value of the tables is in the vocabulary, and the catalogue refuses others" do
    PlantLook::BY_GENUS.each do |genus, row|
      assert_equal PlantLook::TRAITS.size, row.size, genus
      PlantLook::TRAITS.zip(row).each { |trait, value| assert_includes PlantVocabulary.keys(trait), value, "#{genus} #{trait}" if value }
    end
    PlantLook::BY_SPECIES.each do |name, traits|
      traits.each { |trait, value| assert_includes PlantVocabulary.keys(trait), value, "#{name} #{trait}" }
    end
    species = PlantSpecies.new(latin_name: "Testus arbor", flower_color: "chartreuse")
    refute species.valid?
    assert species.errors.key?(:flower_color)
    assert_equal "grey_green", PlantVocabulary.canonical(:foliage_tone, "Gris-vert")
    assert_equal "red_brown", PlantVocabulary.canonical(:bark_color, "brun-rouge")
  end

  test "the species sheet carries the look, camelCase" do
    sheet = plant_species(:alder).sheet_json
    assert_equal({ value: "dark_green", indicative: true }, sheet[:look][:foliageTone])
    assert_equal "none", sheet[:look][:autumnColor][:value]
  end
end
