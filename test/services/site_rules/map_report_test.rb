require "test_helper"
require_relative "../../support/regions_test_helper"
require_relative "../../support/site_rules_test_helper"

class SiteRules::MapReportTest < ActiveSupport::TestCase
  include RegionsTestHelper
  include SiteRulesTestHelper

  setup do
    seed_regions
    seed_site_rules
  end

  test "France: risks with their garden reading, zoning and sources" do
    stub_georisques
    stub_gpu("lyon")
    json = SiteRules::MapReport.new(france_map(owner: users(:michael))).as_json

    assert json["configured"]
    assert_equal({ "key" => "france", "name" => "France" }, json["region"])
    assert_equal "center", json["queriedWith"]

    risks = json["risks"]
    assert risks["available"]
    assert_equal "address", risks["scope"]
    assert risks["items"].take_while { _1["present"] }.size >= 1, "present risks come first"
    clay = risks["items"].find { _1["key"] == "retrait_gonflement_argile" }
    assert_equal "Retrait et gonflement des argiles", clay["label"]
    assert_equal "Exposition moyenne", clay["level"]
    assert_match "fondations", clay["advice"]
    assert_nil risks["items"].find { _1["key"] == "avalanche" }["advice"], "no advice for what does not apply"

    urbanism = json["urbanism"]
    assert urbanism["available"]
    assert_not urbanism["documentMissing"]
    zone = urbanism["zones"].sole
    assert_equal "u", zone["family"]
    assert_match "Jardin", zone["advice"]
    assert_equal "Abords d'un monument historique", urbanism["easements"].sole["label"]
    assert_equal %w[georisques gpu], json["sources"].map { _1["key"] }
    assert json["sources"].all? { _1["licence"] == "Licence Ouverte 2.0 (Etalab)" }
  end

  test "the outline is sent when the map has one" do
    stub_georisques
    stub_gpu("escles")
    map = france_map(owner: users(:michael), boundary: "MULTIPOLYGON(((6.169 48.114, 6.170 48.114, 6.170 48.115, 6.169 48.115, 6.169 48.114)))")
    json = SiteRules::MapReport.new(map).as_json

    assert_equal "outline", json["queriedWith"]
    assert_requested(:post, "#{GPU}/secteur-cc") { |request| JSON.parse(request.body).dig("geom", "type") == "MultiPolygon" }
    assert_equal "not_constructible", json["urbanism"]["sectors"].sole["family"]
    assert_match "interdites", json["urbanism"]["sectors"].sole["advice"]
  end

  test "RNU commune, and a provider down does not take the other with it" do
    stub_georisques("down", status: 503)
    stub_gpu("chamberaud")
    json = SiteRules::MapReport.new(france_map(owner: users(:michael), center: [ 2.05, 46.05 ])).as_json

    assert_equal({ "available" => false, "reason" => "unavailable" }, json["risks"])
    assert json["urbanism"]["rnu"]
    assert_not json["urbanism"]["documentMissing"]
    assert_equal %w[gpu], json["sources"].map { _1["key"] }
  end

  test "network easements can be left out (public views, exports, MCP)" do
    stub_georisques
    stub_gpu("chamberaud")
    stub_request(:post, "#{GPU}/assiette-sup-l").to_return(status: 200, body: { type: "FeatureCollection", features: [
      { type: "Feature", geometry: nil, properties: { suptype: "i3", typeass: "Zone de servitude" } }
    ] }.to_json)
    map = france_map(owner: users(:michael), center: [ 2.05, 46.05 ])

    with = SiteRules::MapReport.new(map).as_json["urbanism"]["easements"]
    assert_equal %w[ac1 i3], with.map { _1["category"] }.sort
    assert with.find { _1["category"] == "i3" }["network"]
    without = SiteRules::MapReport.new(map, include_networks: false).as_json["urbanism"]["easements"]
    assert_equal %w[ac1], without.map { _1["category"] }
  end

  test "outside France: not configured, with the region layers that cover the subject" do
    json = SiteRules::MapReport.new(maps(:ahinvaux).tap { _1.update!(region: region("wallonia")) }).as_json

    assert_not json["configured"]
    assert_equal({ "available" => false, "reason" => "not_configured" }, json["risks"])
    assert_equal({ "available" => false, "reason" => "not_configured" }, json["urbanism"])
    assert_equal [ "plan_secteur", "natura2000" ], json["layers"].map { _1["key"] }
    assert_equal "Plan de secteur", json["layers"].first["name"]
    assert_empty json["sources"]
    assert_not_requested :any, /apicarto|georisques/
  end

  test "providers switched off by ENV: not configured" do
    json = SiteRules::MapReport.new(france_map(owner: users(:michael)),
                                    risks: Providers::Georisques.build({ "GEORISQUES_URL" => "none" }),
                                    urbanism: Providers::Urbanism::Gpu.build({ "GPU_URL" => "none" })).as_json
    assert_not json["configured"]
    assert_equal "not_configured", json["risks"]["reason"]
    assert_equal "not_configured", json["urbanism"]["reason"]
    assert_not_requested :any, /apicarto|georisques/
  end

  test "a map with no place yet" do
    map = france_map(owner: users(:michael))
    map.update_columns(center: nil)
    json = SiteRules::MapReport.new(map.reload).as_json
    assert_equal "no_location", json["risks"]["reason"]
    assert_equal "no_location", json["urbanism"]["reason"]
  end
end
