require "test_helper"
require Rails.root.join("db/migrate/20261123180000_hand_empty_imported_sheets_to_the_seed")

class HandEmptyImportedSheetsToTheSeedTest < ActiveSupport::TestCase
  setup { HandEmptyImportedSheetsToTheSeed.verbose = false }

  test "an empty imported sheet gets the seed's strata, size and names" do
    geum = PlantSpecies.create!(latin_name: "Geum urbanum", review_status: "reviewed", strata: "shrub")
    geum.replace_common_names!([ "Benoite commune" ])
    geum.record_provenance!(%w[common_names], source: "terranova", status: "to_verify")

    HandEmptyImportedSheetsToTheSeed.new.up
    Catalog::SeedLoader.new.call
    geum.reload

    assert_equal "herbaceous", geum.strata
    assert_equal "herbaceous", geum.plant_type
    assert_equal 0.6, geum.height_max_m.to_f
    assert_equal "Benoîte commune", geum.common_name
    assert_equal "reviewed", geum.review_status
    assert_equal "semisto", geum.provenance_for(:strata).source
    assert_operator geum.adult_spread("herbaceous").metres.to_f, :<, 1
  end

  test "leaves a sheet someone filled, and a value someone checked" do
    campanula = PlantSpecies.create!(latin_name: "Campanula trachelium", review_status: "reviewed", strata: "shrub", plant_type: "herbaceous")
    stellaria = PlantSpecies.create!(latin_name: "Stellaria media", review_status: "reviewed", strata: "herbaceous")
    stellaria.record_provenance!(%w[strata], source: "user", status: "sourced")

    HandEmptyImportedSheetsToTheSeed.new.up

    assert_equal "shrub", campanula.reload.strata
    assert_equal "herbaceous", stellaria.reload.strata
  end
end
