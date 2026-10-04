require "test_helper"

class PlantIdentification::CatalogueMatcherTest < ActiveSupport::TestCase
  setup { @matcher = PlantIdentification::CatalogueMatcher.new }

  test "an exact latin name matches, whatever the case and the spacing" do
    assert_equal plant_species(:apple), @matcher.match("Malus domestica")
    assert_equal plant_species(:apple), @matcher.match("  malus   DOMESTICA ")
  end

  test "authorship is ignored on either side" do
    assert_equal plant_species(:apple), @matcher.match("Malus domestica (Suckow) Borkh.")

    sage = PlantSpecies.create!(latin_name: "Salvia officinalis L.")
    assert_equal sage, @matcher.match("Salvia officinalis")
  end

  test "a hybrid sign is ignored" do
    mint = PlantSpecies.create!(latin_name: "Mentha × piperita")
    assert_equal mint, @matcher.match("Mentha x piperita")
    assert_equal mint, @matcher.match("Mentha × piperita")
  end

  test "the shortest name wins when several catalogue names share the species" do
    PlantSpecies.create!(latin_name: "Prunus cerasus subsp. acida")
    sour_cherry = PlantSpecies.create!(latin_name: "Prunus cerasus L.")
    assert_equal sour_cherry, @matcher.match("Prunus cerasus")
  end

  test "an exact name beats a longer name of the same species" do
    PlantSpecies.create!(latin_name: "Malus domestica subsp. pumila")
    assert_equal plant_species(:apple), @matcher.match("Malus domestica")
  end

  test "no match when the species is not in the catalogue" do
    assert_nil @matcher.match("Quercus robur")
    assert_nil @matcher.match("Malus sylvestris")
  end

  test "a genus alone never matches a species, nor does an empty name" do
    assert_nil @matcher.match("Malus")
    assert_nil @matcher.match("")
    assert_nil @matcher.match(nil)
  end

  test "a catalogue genus word is not a prefix match of another genus" do
    PlantSpecies.create!(latin_name: "Malusa fictiva")
    assert_equal plant_species(:apple), @matcher.match("Malus domestica")
    assert_nil @matcher.match("Malus fictiva")
  end

  test "binomial keeps genus and species only" do
    assert_equal "malus domestica", PlantIdentification::CatalogueMatcher.binomial("Malus domestica (Suckow) Borkh.")
    assert_equal "mentha piperita", PlantIdentification::CatalogueMatcher.binomial("Mentha × piperita L.")
    assert_equal "prunus cerasus", PlantIdentification::CatalogueMatcher.binomial("Prunus cerasus subsp. acida")
    assert_nil PlantIdentification::CatalogueMatcher.binomial("Malus")
    assert_nil PlantIdentification::CatalogueMatcher.binomial(nil)
  end
end
