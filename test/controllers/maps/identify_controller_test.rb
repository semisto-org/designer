require "test_helper"
require_relative "../../support/map_data_test_helper"

class Maps::IdentifyControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    @map = maps(:ahinvaux)
  end

  test "a viewer reads the layers at a point" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_sols.json")
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    sign_in_as users(:alice)
    get map_identify_path(@map), params: { lng: 4.9055, lat: 50.3405, zoom: 17, layers: %w[sols cadastre ortho_2026 unknown] }, as: :json
    assert_response :success
    results = response.parsed_body["results"]
    assert_equal %w[sols cadastre], results.pluck("key")
    assert_equal "Carte des sols", results.first["name"]
    assert_equal "ok", results.first["status"]
    assert_equal "Fiche du type de sol", results.first["entries"].first["hrefLabel"]
    assert_equal "Parcelle 247X9, section B", results.second["entries"].first["text"]
  end

  test "zoom derived from the viewport when missing" do
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_empty.json")
    sign_in_as users(:michael)
    get map_identify_path(@map), params: { lng: 4.9, lat: 50.34, extent: "4.89,50.33,4.91,50.35", size: "1024,800", layers: %w[sols] }, as: :json
    assert_response :success
    assert_equal "empty", response.parsed_body["results"].first["status"]
  end

  test "outside the region: empty without calling the upstream" do
    sign_in_as users(:michael)
    get map_identify_path(@map), params: { lng: 2.35, lat: 48.85, zoom: 17, layers: %w[sols] }, as: :json
    assert_equal "empty", response.parsed_body["results"].first["status"]
    assert_not_requested :get, SPW_REST
  end

  test "invalid coordinates" do
    sign_in_as users(:michael)
    get map_identify_path(@map), params: { lng: "x", lat: 50, layers: %w[sols] }, as: :json
    assert_response :unprocessable_entity
    get map_identify_path(@map), params: { lng: 4.9, lat: 99, zoom: 17, layers: %w[sols] }, as: :json
    assert_response :unprocessable_entity
  end

  test "strangers get a 404" do
    sign_in_as users(:bob)
    get map_identify_path(@map), params: { lng: 4.9, lat: 50.34, zoom: 17, layers: %w[sols] }, as: :json
    assert_response :not_found
  end
end
