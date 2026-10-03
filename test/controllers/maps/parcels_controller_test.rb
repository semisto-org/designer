require "test_helper"
require_relative "../../support/map_data_test_helper"

class Maps::ParcelsControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    @map = maps(:ahinvaux)
    sign_in_as users(:michael)
  end

  test "lookup returns the parcel under the click" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    get map_parcel_lookup_path(@map), params: { lng: 4.9055, lat: 50.3405 }, as: :json
    assert_response :success
    parcel = response.parsed_body["parcel"]
    assert_equal "92142B0247/00X009", parcel["capakey"]
    assert_equal "Parcelle 247X9, section B", parcel["label"]
    assert_equal "MultiPolygon", parcel["geometry"]["type"]
  end

  test "lookup: nothing here, unreachable cadastre" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_empty.json")
    get map_parcel_lookup_path(@map), params: { lng: 4.9, lat: 50.34 }, as: :json
    assert_response :not_found
    assert_equal I18n.t("map_data.parcels.nothing_here"), response.parsed_body["message"]

    stub_request(:get, SPW_REST).to_timeout
    get map_parcel_lookup_path(@map), params: { lng: 4.91, lat: 50.34 }, as: :json
    assert_response :service_unavailable
  end

  test "create unions the parcels into the boundary" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    post map_parcels_path(@map), params: { parcels: [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ] }, as: :json
    assert_response :success
    body = response.parsed_body["map"]
    assert_equal [ "92142B0247/00X009" ], body["parcels"]
    assert_equal "MultiPolygon", body["boundary"]["type"]
    assert_in_delta 7_915, body["areaM2"], 100
  end

  test "create with nothing selected or junk" do
    post map_parcels_path(@map), params: { parcels: [] }, as: :json
    assert_response :unprocessable_entity
    post map_parcels_path(@map), params: { parcels: [ "junk" ] }, as: :json
    assert_response :unprocessable_entity
  end

  test "viewers cannot pick parcels" do
    sign_in_as users(:alice)
    get map_parcel_lookup_path(@map), params: { lng: 4.9, lat: 50.34 }, as: :json
    assert_response :forbidden
    post map_parcels_path(@map), params: { parcels: [] }, as: :json
    assert_response :forbidden
  end

  test "a region without cadastre" do
    wallonia_layer("cadastre").update!(options: {})
    get map_parcel_lookup_path(@map), params: { lng: 4.9, lat: 50.34 }, as: :json
    assert_response :not_found
    assert_equal I18n.t("map_data.parcels.errors.unavailable"), response.parsed_body["message"]
  end
end
