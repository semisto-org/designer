require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../support/regions_test_helper"
require_relative "../../support/site_rules_test_helper"

class Providers::UrbanismGpuTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include RegionsTestHelper
  include SiteRulesTestHelper

  def point(lng, lat) = { "type" => "Point", "coordinates" => [ lng, lat ] }

  test "picked by the region settings: France only" do
    seed_regions
    seed_site_rules
    assert_kind_of Providers::Urbanism::Gpu, Providers::Urbanism.for(region("france"))
    assert_nil Providers::Urbanism.for(region("wallonia"))
    assert_nil Providers::Urbanism.for(Region.europe)
  end

  test "a PLU: document, zone with its regulation, prescriptions and easements" do
    stub_gpu("lyon")
    rules = Providers::Urbanism::Gpu.build({}).rules_for(point(4.833, 45.767))

    assert_requested :post, "#{GPU}/zone-urba", body: { geom: point(4.833, 45.767) }.to_json
    assert_equal [ "Lyon", "Lyon-1er-Arrondissement" ], rules[:communes].map { _1[:name] }
    assert_not rules[:rnu]
    assert_not rules[:partial]

    doc = rules[:documents].sole
    assert_equal "PLUi", doc[:type]
    assert_equal "2026-03-26", doc[:date]
    assert_equal "https://www.geoportail-urbanisme.gouv.fr/document/by-id/4f3ddc27a9611b4bc94fa161443b8e86", doc[:url]

    zone = rules[:zones].sole
    assert_equal({ label: "UCe1b", type: "U", family: "u", date: "2026-03-26" }, zone.slice(:label, :type, :family, :date))
    assert_equal "https://data.geopf.fr/annexes/gpu/documents/DU_200046977/4f3ddc27a9611b4bc94fa161443b8e86/200046977_reglement_20260326.pdf", zone[:url]

    assert_equal 3, rules[:prescriptions].sum { _1[:count] }
    assert_equal [ "surface" ], rules[:prescriptions].first[:kinds]

    easement = rules[:easements].sole
    assert_equal "ac1", easement[:category]
    assert_equal 3, easement[:count]
    assert_equal "Périmètre des abords", easement[:kind]
    assert_not easement[:network]
    assert_match %r{\Ahttps://data\.geopf\.fr/annexes/gpu/documents/172014607_SUP_69_AC1/}, easement[:url]
  end

  test "a carte communale: its sector, no zone" do
    stub_gpu("escles")
    rules = Providers::Urbanism::Gpu.build({}).rules_for(point(6.1697, 48.1147))
    assert_equal "CC", rules[:documents].sole[:type]
    assert_empty rules[:zones]
    sector = rules[:sectors].sole
    assert_equal({ label: "ZNC", type: "03", family: "not_constructible", date: "2012-12-12" }, sector.slice(:label, :type, :family, :date))
  end

  test "a commune under the RNU: no document, the national rules apply" do
    stub_gpu("chamberaud")
    rules = Providers::Urbanism::Gpu.build({}).rules_for(point(2.05, 46.05))
    assert rules[:rnu]
    assert_empty rules[:documents]
    assert_equal "Chamberaud", rules[:communes].sole[:name]
    assert_equal "ac1", rules[:easements].sole[:category]
  end

  test "network easements are flagged" do
    stub_gpu("chamberaud")
    stub_request(:post, "#{GPU}/assiette-sup-l").to_return(status: 200, body: { type: "FeatureCollection", features: [
      { type: "Feature", geometry: nil, properties: { suptype: "i4", typeass: "Zone de servitude", nomsuplitt: "Ligne 63 kV", partition: "P", gpu_doc_id: "D", fichier: "I4_act.pdf" } }
    ] }.to_json)
    rules = Providers::Urbanism::Gpu.build({}).rules_for(point(2.05, 46.05))
    line = rules[:easements].find { _1[:category] == "i4" }
    assert line[:network]
    assert_equal "https://data.geopf.fr/annexes/gpu/documents/P/D/I4_act.pdf", line[:url]
  end

  test "an optional endpoint down: partial; an essential one down: unavailable" do
    stub_gpu("lyon")
    stub_request(:post, "#{GPU}/assiette-sup-s").to_return(status: 500)
    rules = Providers::Urbanism::Gpu.build({}).rules_for(point(4.833, 45.767))
    assert rules[:partial]
    assert_empty rules[:easements]
    assert_equal "UCe1b", rules[:zones].sole[:label]

    stub_request(:post, "#{GPU}/zone-urba").to_timeout
    assert_raises(Providers::Urbanism::Unavailable) { Providers::Urbanism::Gpu.build({}).rules_for(point(4.833, 45.767)) }
  end

  test "answers are cached per geometry; GPU_URL=none switches it off" do
    with_memory_cache do
      stub_gpu("escles")
      gpu = Providers::Urbanism::Gpu.build({})
      2.times { gpu.rules_for(point(6.1697, 48.1147)) }
      assert_requested :post, "#{GPU}/document", times: 1
    end

    gpu = Providers::Urbanism::Gpu.build({ "GPU_URL" => "none" })
    assert_not gpu.available?
    assert_raises(Providers::Urbanism::Unavailable) { gpu.rules_for(point(6.1697, 48.1147)) }
  end
end
