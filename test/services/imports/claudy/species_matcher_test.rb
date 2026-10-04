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

  test "a latin synonym of the catalogue finds its species, never over another species' own name" do
    rosemary = plant_species(:rosemary)
    rosemary.replace_common_names!([ "Rosmarinus officinalis" ], language: "la")
    plant_species(:alder).replace_common_names!([ "Salvia rosmarinus" ], language: "la")

    matcher = Matcher.new
    assert_equal rosemary, matcher.match(latin_name: "Rosmarinus officinalis L.").species
    assert_equal rosemary, matcher.match(latin_name: "Salvia rosmarinus").species
  end

  test "without a latin name, a French common name carried by exactly one species" do
    raspberry = PlantSpecies.create!(latin_name: "Rubus idaeus")
    raspberry.replace_common_names!([ "Framboisier" ])
    raspberry.varieties.create!(name: "Héritage")
    matcher = Matcher.new

    match = matcher.match(latin_name: nil, name: "framboisier", variety: "Heritage")
    assert_equal raspberry, match.species
    assert_equal "Héritage", match.variety.name
    assert_nil matcher.match(latin_name: "Rubus nonexistens", name: "Framboisier"), "a latin name, even unknown, wins"

    PlantSpecies.create!(latin_name: "Rubus phoenicolasius").replace_common_names!([ "Framboisier" ])
    assert_nil Matcher.new.match(latin_name: nil, name: "Framboisier"), "two species carry it: no guess"
  end

  test "falls back to the binomial only when it points to one species" do
    matcher = Matcher.new
    assert_equal plant_species(:comfrey), matcher.find_species("Symphytum officinale subsp. uliginosum")
  end
end
