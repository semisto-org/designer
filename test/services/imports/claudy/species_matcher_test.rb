require "test_helper"

class Imports::Claudy::SpeciesMatcherTest < ActiveSupport::TestCase
  Matcher = Imports::Claudy::SpeciesMatcher

  test "normalises latin names" do
    assert_equal "malus domestica", Matcher.canonical("Malus domestica Borkh.")
    assert_equal "alnus glutinosa", Matcher.canonical("Alnus glutinosa (L.) Gaertn.")
    assert_equal "malus domestica", Matcher.canonical("Malus domestica 'Reinette grise'")
    assert_equal "prunus x gondouinii", Matcher.canonical("Prunus ×gondouinii")
    assert_equal "x sorbopyrus auricularis", Matcher.canonical("× Sorbopyrus auricularis")
    assert_equal "sambucus nigra subsp canadensis", Matcher.canonical("Sambucus nigra subsp. canadensis")
    assert_equal "sambucus nigra", Matcher.binomial("Sambucus nigra ssp. canadensis")
    assert_equal "mespilus germanica", Matcher.canonical("MESPILUS GERMANICA L.")
    assert_nil Matcher.canonical("")
  end

  test "reads the cultivar in quotes or after cv." do
    assert_equal "Reinette grise", Matcher.cultivar("Malus domestica 'Reinette grise'")
    assert_equal "Gravenstein", Matcher.cultivar("Malus domestica cv. Gravenstein")
    assert_nil Matcher.cultivar("Malus domestica Borkh.")
  end

  test "matches a species with author abbreviations, and its variety by folded name" do
    matcher = Matcher.new
    match = matcher.match(latin_name: "Malus domestica Borkh.", variety: "reinette  GRISE")
    assert_equal plant_species(:apple), match.species
    assert_equal plant_varieties(:reinette), match.variety

    match = matcher.match(latin_name: "Malus domestica 'Gravenstein'")
    assert_equal plant_species(:apple), match.species
    assert_nil match.variety
    assert_equal "Gravenstein", match.cultivar
  end

  test "tries the name when the latin name is missing or unknown, and never invents a species" do
    matcher = Matcher.new
    assert_equal plant_species(:alder), matcher.match(latin_name: nil, name: "Alnus glutinosa").species
    assert_nil matcher.match(latin_name: "Mespilus germanica L.", name: "Néflier")
    assert_no_difference(-> { PlantSpecies.count }) { matcher.match(latin_name: "Mespilus germanica") }
  end

  test "falls back to the binomial only when it points to one species" do
    matcher = Matcher.new
    assert_equal plant_species(:comfrey), matcher.find_species("Symphytum officinale subsp. uliginosum")
  end
end
