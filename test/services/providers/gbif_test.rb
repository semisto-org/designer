require "test_helper"
require_relative "../../test_helpers/gbif_test_helper"

class Providers::GbifTest < ActiveSupport::TestCase
  include GbifTestHelper

  test "an accepted species name" do
    stub_gbif("Salvia nemorosa" => gbif_accepted("Salvia nemorosa", key: 2927028))
    match = Providers::Gbif.new.match("Salvia nemorosa")
    assert_equal "accepted", match.status
    assert_equal "Salvia nemorosa", match.suggested_name
    assert_equal "Lamiaceae", match.family
    assert_equal "https://www.gbif.org/species/2927028", match.as_json[:url]
  end

  test "an outdated name points to the accepted one" do
    stub_gbif("Stipa tenuissima" => gbif_synonym("Stipa tenuissima", "Nassella tenuissima", accepted_key: 5289833))
    match = Providers::Gbif.new.match("Stipa tenuissima")
    assert_equal "synonym", match.status
    assert_equal "Nassella tenuissima", match.suggested_name
    assert_equal 5289833, match.key
  end

  test "a typo is read as a nearby spelling" do
    stub_gbif("Salvia nemorossa" => gbif_accepted("Salvia nemorosa").merge("matchType" => "FUZZY"))
    match = Providers::Gbif.new.match("Salvia nemorossa")
    assert_equal "fuzzy", match.status
    assert_equal "Salvia nemorosa", match.suggested_name
  end

  test "a genus or an unknown name is not a species" do
    stub_gbif({ "Rosa" => { "matchType" => "EXACT", "rank" => "GENUS", "canonicalName" => "Rosa" } },
              { "matchType" => "HIGHERRANK", "rank" => "KINGDOM" })
    assert_equal "unknown", Providers::Gbif.new.match("Rosa").status
    assert_equal "unknown", Providers::Gbif.new.match("Choux bizarre").status
  end

  test "keeps the hybrid sign GBIF drops from the canonical name" do
    stub_gbif("Hamamelis × intermedia" => gbif_accepted("Hamamelis × intermedia", scientific: "Hamamelis × intermedia Rehder"))
    assert_equal "Hamamelis × intermedia", Providers::Gbif.new.match("Hamamelis × intermedia").name
  end

  test "says it could not check rather than « unknown »" do
    stub_request(:get, GbifTestHelper::MATCH).to_return(status: 503)
    assert_raises(Providers::Gbif::Unavailable) { Providers::Gbif.new.match("Salvia nemorosa") }
    assert_raises(Providers::Gbif::Unavailable) { Providers::Gbif.new(available: false).match("Salvia nemorosa") }
  end
end
