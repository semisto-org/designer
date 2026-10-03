require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::CadastreTest < ActiveSupport::TestCase
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    @cadastre = Providers::Cadastre.for(regions(:wallonia))
  end

  test "uses the region layer whose role is cadastre" do
    assert_equal "cadastre", @cadastre.layer.key
    wallonia_layer("cadastre").update!(options: {})
    assert_nil Providers::Cadastre.for(regions(:wallonia).reload)
  end

  test "parcel at a point, with its outline as GeoJSON" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    parcel = @cadastre.parcel_at(4.9055, 50.3405)
    assert_equal "92142B0247/00X009", parcel.capakey
    assert_equal "Parcelle 247X9, section B", parcel.label
    assert_equal "YVOIR 2 DIV · 92142B0247/00X009", parcel.detail
    assert_equal "MultiPolygon", parcel.geometry["type"]
    assert_requested(:get, SPW_REST) do |req|
      q = req.uri.query_values
      q["returnGeometry"] == "true" && q["sr"] == "4326" && q["tolerance"] == "0" && q["layers"] == "all:0"
    end
  end

  test "nothing here" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_empty.json")
    assert_nil @cadastre.parcel_at(4.9, 50.34)
  end

  test "a parcel is cached by CAPAKEY; a miss identifies again and checks the key" do
    stub = stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    with_memory_cache do
      @cadastre.parcel_at(4.9055, 50.3405)
      assert_equal "92142B0247/00X009", @cadastre.parcel("92142B0247/00X009", lng: 0, lat: 0).capakey
      assert_requested stub, times: 1
    end
    assert_equal "92142B0247/00X009", @cadastre.parcel("92142B0247/00X009", lng: 4.9055, lat: 50.3405).capakey
    assert_nil @cadastre.parcel("92142B9999/00_000", lng: 4.9055, lat: 50.3405)
  end

  test "upstream failure raises" do
    stub_request(:get, SPW_REST).to_return(status: 502)
    assert_raises(Providers::GeoHttp::Unavailable) { @cadastre.parcel_at(4.9, 50.34) }
  end
end
