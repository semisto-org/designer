require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::ArcgisIdentifyTest < ActiveSupport::TestCase
  include MapDataTestHelper

  setup { seed_wallonia_layers }

  def layers(*keys) = keys.map { |k| wallonia_layer(k) }

  test "identifies each layer in parallel and formats the answers" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_sols.json")
    stub_identify("RELIEF/WALLONIE_MNT_2021_2022", "identify_courbes.json")
    stub_identify("FAUNE_FLORE/NATURA2000", "identify_empty.json")

    results = Providers::ArcgisIdentify.new(layers("sols", "courbes", "natura2000")).call(lng: 4.9055, lat: 50.3405, zoom: 17)
    assert_equal %w[sols courbes natura2000], results.map(&:key)
    assert_equal %w[ok ok empty], results.map(&:status)
    assert_equal "Sol Gbbfi2", results.first.entries.first[:text]
    assert_equal "Altitude 187,5 m", results.second.entries.first[:text]
    json = results.first.as_json
    assert_equal "Fiche du type de sol", json[:entries].first[:hrefLabel]
  end

  test "sends the documented identify parameters" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_empty.json")
    Providers::ArcgisIdentify.new(layers("sols")).call(lng: 4.9, lat: 50.34, zoom: 17)
    assert_requested(:get, SPW_REST) do |req|
      q = req.uri.query_values
      q["f"] == "json" && q["geometry"] == "4.9,50.34" && q["geometryType"] == "esriGeometryPoint" &&
        q["sr"] == "4326" && q["layers"] == "all:1,2" && q["tolerance"] == "3" &&
        q["imageDisplay"] == "101,101,96" && q["returnGeometry"] == "false" && q["mapExtent"].split(",").size == 4
    end
  end

  test "contours identify on the LiDAR DTM with zero tolerance" do
    stub_identify("RELIEF/WALLONIE_MNT_2021_2022", "identify_courbes.json")
    Providers::ArcgisIdentify.new(layers("courbes")).call(lng: 4.9, lat: 50.34, zoom: 18)
    assert_requested(:get, %r{RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify}) { |req| req.uri.query_values["tolerance"] == "0" }
  end

  test "errors and timeouts become 'unavailable' without failing the other layers" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_error.json")
    stub_request(:get, %r{FAUNE_FLORE/NATURA2000}).to_timeout
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    results = Providers::ArcgisIdentify.new(layers("sols", "natura2000", "cadastre")).call(lng: 4.9055, lat: 50.3405, zoom: 18)
    assert_equal %w[unavailable unavailable ok], results.map(&:status)
  end

  test "skips layers that cannot be identified (photos)" do
    assert_empty Providers::ArcgisIdentify.new(layers("ortho_2026")).call(lng: 4.9, lat: 50.34, zoom: 17)
  end

  test "caches answers per layer, point and zoom; failures are not cached" do
    ok = stub_identify("SOL_SOUS_SOL/CNSW", "identify_sols.json")
    failing = stub_request(:get, %r{FAUNE_FLORE/NATURA2000}).to_return(status: 500)
    with_memory_cache do
      2.times { Providers::ArcgisIdentify.new(layers("sols", "natura2000")).call(lng: 4.9055, lat: 50.3405, zoom: 17.2) }
    end
    assert_requested ok, times: 1
    assert_requested failing, times: 2
  end

  test "extent grows when zooming out" do
    layer = wallonia_layer("sols")
    near = Providers::ArcgisIdentify.params(layer, lng: 4.9, lat: 50.34, zoom: 18, return_geometry: false, tolerance: nil)
    far = Providers::ArcgisIdentify.params(layer, lng: 4.9, lat: 50.34, zoom: 14, return_geometry: false, tolerance: nil)
    width = ->(params) { params[:mapExtent].split(",").map(&:to_f).then { |w, _, e, _| e - w } }
    assert_in_delta width.(far), width.(near) * 16, 1e-5
  end
end
