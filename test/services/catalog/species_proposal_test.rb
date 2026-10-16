require "test_helper"
require_relative "../../test_helpers/gbif_test_helper"

class Catalog::SpeciesProposalTest < ActiveSupport::TestCase
  include GbifTestHelper

  setup do
    @map = maps(:ahinvaux)
    @user = users(:michael)
    stub_gbif("Salvia nemorosa" => gbif_accepted("Salvia nemorosa", key: 42),
              "Stipa tenuissima" => gbif_synonym("Stipa tenuissima", "Nassella tenuissima"),
              "Malus sylvestris" => gbif_synonym("Malus sylvestris", "Malus domestica"))
  end

  def proposal(user: @user) = Catalog::SpeciesProposal.new(map: @map, user:)

  test "creates a proposed species with the person's values to verify, and adds it to the palette" do
    result = proposal.create(latin_name: "salvia  nemorosa", common_name: "Sauge des bois",
                             values: { "strata" => "herbaceous", "height_max_m" => "0.5", "spread_max_m" => "" })
    species = result.species
    assert result.created
    assert_equal "Salvia nemorosa", species.latin_name
    assert_equal "proposed", species.review_status
    assert_equal @user, species.proposed_by
    assert_equal @map, species.proposed_map
    assert_equal 42, species.gbif_key
    assert_equal "Lamiaceae", species.family
    assert_equal "Sauge des bois", species.common_name
    assert_equal 0.5, species.height_max_m.to_f
    assert_nil species.spread_max_m
    assert_equal %w[user to_verify], species.provenance_for(:height_max_m).then { [ _1.source, _1.status ] }
    assert_equal species, result.item.species
    assert_equal "active", result.item.status
  end

  test "a second person proposing the same plant joins the first species" do
    first = proposal.create(latin_name: "Salvia nemorosa").species
    other_map = Map.create!(name: "Autre", owner: users(:bob))
    second = Catalog::SpeciesProposal.new(map: other_map, user: users(:bob)).create(latin_name: "Salvia Nemorosa")
    assert_not second.created
    assert_equal first, second.species
    assert other_map.palette_items.exists?(species: first)
  end

  test "an outdated name already in the catalogue as a latin synonym lands on that species" do
    apple = plant_species(:apple)
    apple.replace_common_names!([ "Pyrus malus" ], language: "la")
    result = proposal.create(latin_name: "Pyrus malus")
    assert_not result.created
    assert_equal apple, result.species
  end

  test "check tells the GBIF verdict and the species already in the catalogue" do
    check = proposal.check("Malus sylvestris")
    assert_equal "synonym", check[:gbif][:status]
    assert_equal [ "Malus domestica" ], check[:existing].map { _1[:latinName] }

    stub_request(:get, GbifTestHelper::MATCH).to_return(status: 500)
    assert_equal "unavailable", proposal.check("Salvia nemorosa")[:gbif][:status]
  end

  test "check never reveals another person's proposed species" do
    Catalog::SpeciesProposal.new(map: Map.create!(name: "Autre", owner: users(:bob)), user: users(:bob)).create(latin_name: "Salvia nemorosa")
    assert_empty proposal.check("Salvia nemorosa")[:existing]
  end

  test "refuses a name that is not a genus and an epithet, and too many proposals a day" do
    error = assert_raises(Catalog::SpeciesProposal::Refused) { proposal.create(latin_name: "sauge") }
    assert_match "nom latin", error.message
    assert_raises(Catalog::SpeciesProposal::Refused) { proposal.create(latin_name: "Rosa") }

    limited = proposal
    limited.define_singleton_method(:daily_limit) { 1 }
    limited.create(latin_name: "Salvia nemorosa")
    error = assert_raises(Catalog::SpeciesProposal::Refused) { limited.create(latin_name: "Salvia pratensis") }
    assert_match "aujourd'hui", error.message
  end

  test "an AI draft of that species is accepted rather than duplicated" do
    species = proposal.create(latin_name: "Salvia nemorosa").species
    @map.palette_items.where(species:).update_all(status: "draft")
    result = proposal.create(latin_name: "Salvia nemorosa")
    assert_equal "active", result.item.reload.status
    assert_equal 1, PaletteItem.where(map: @map, species:).count
  end
end
