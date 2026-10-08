require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../support/regions_test_helper"
require_relative "../../support/site_rules_test_helper"

class Providers::GeorisquesTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include RegionsTestHelper
  include SiteRulesTestHelper

  POINT = Providers::Climate::Point.new(lng: 4.833, lat: 45.767)

  test "picked by the region settings: France only" do
    seed_regions
    seed_site_rules
    assert_kind_of Providers::Georisques, Providers::Georisques.for(region("france"))
    assert_nil Providers::Georisques.for(region("wallonia"))
    assert_nil Providers::Georisques.for(Region.europe)
  end

  test "reads the risk report at a point, natural risks first" do
    stub_georisques
    report = Providers::Georisques.build({}).report_at(POINT)

    assert_requested :get, GEORISQUES, query: { "latlon" => "4.833,45.767" }
    assert_equal "address", report[:scope]
    assert_equal({ name: "Lyon 1er Arrondissement", insee: "69381", postcode: "69001" }, report[:commune])
    assert_match %r{\Ahttps://www\.georisques\.gouv\.fr/mes-risques/}, report[:url]
    assert_equal 18, report[:risks].size
    assert_equal Providers::Georisques::NATURAL + Providers::Georisques::TECHNOLOGICAL, report[:risks].map { _1[:key] }

    clay = report[:risks].find { _1[:key] == "retraitGonflementArgile" }
    assert clay[:present]
    assert_equal "Exposition moyenne", clay[:address_status]
    assert_equal "natural", clay[:group]
    assert_not report[:risks].find { _1[:key] == "avalanche" }[:present]
    assert_equal "technological", report[:risks].find { _1[:key] == "icpe" }[:group]
  end

  test "without a present flag, the status says whether the place is concerned" do
    body = { commune: { libelle: "X", codeInsee: "01001" }, risquesNaturels: {
      seisme: { libelleStatutCommune: "Risque Existant", libelleStatutAdresse: "Zone 3 - Modérée" },
      avalanche: { libelleStatutCommune: "Risque Inexistant" },
      radon: { libelleStatutCommune: "Risque non concerné" },
      nouveauRisque: { libelle: "Nouveau", libelleStatutCommune: "Risque Existant" }
    } }.to_json
    stub_georisques(body)
    risks = Providers::Georisques.build({}).report_at(POINT)[:risks].index_by { _1[:key] }

    assert risks["seisme"][:present]
    assert_not risks["avalanche"][:present]
    assert_not risks["radon"][:present]
    assert risks["nouveauRisque"][:present], "a risk Géorisques adds later is kept"
    assert_equal "commune", Providers::Georisques.build({}).report_at(POINT)[:scope]
  end

  test "answers are cached a week per point" do
    with_memory_cache do
      stub_georisques
      provider = Providers::Georisques.build({})
      2.times { provider.report_at(POINT) }
      assert_requested :get, GEORISQUES, times: 1
    end
  end

  test "down, garbage or switched off: unavailable" do
    stub_georisques("oops", status: 503)
    assert_raises(Providers::Georisques::Unavailable) { Providers::Georisques.build({}).report_at(POINT) }

    stub_georisques({ message: "bad request" }.to_json)
    assert_raises(Providers::Georisques::Unavailable) { Providers::Georisques.build({}).report_at(POINT) }

    provider = Providers::Georisques.build({ "GEORISQUES_URL" => "none" })
    assert_not provider.available?
    assert_raises(Providers::Georisques::Unavailable) { provider.report_at(POINT) }
  end

  test "GEORISQUES_URL points to another host" do
    stub_request(:get, %r{\Ahttps://risques\.example\.org/v1/resultats_rapport_risque}).to_return(status: 200, body: file_fixture("site_rules/georisques_rapport.json").read)
    report = Providers::Georisques.build({ "GEORISQUES_URL" => "https://risques.example.org/v1/" }).report_at(POINT)
    assert_equal 18, report[:risks].size
  end
end
