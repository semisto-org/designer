require "test_helper"
require_relative "../../test_helpers/climate_test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::DossiersControllerTest < ActionDispatch::IntegrationTest
  include ClimateTestHelper
  include SoilPhotosHelper

  setup do
    seed_climate!
    @map = maps(:ahinvaux)
    @pipe = @map.features.create!(layer: "networks", kind: "gas_line",
                                  geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.340 ], [ 4.906, 50.341 ] ] })
  end

  def feature_ids = response.parsed_body.dig("cover", "features", "features").map { |f| f["id"] }

  test "requires sign in and a role on the map" do
    get map_dossier_path(@map, format: :json)
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_dossier_path(@map, format: :json)
    assert_response :not_found
    get map_dossier_path(@map)
    assert_response :not_found
  end

  test "the page is an Inertia page without the app chrome data it does not need" do
    sign_in_as users(:michael)
    get map_dossier_path(@map), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/dossiers/show", page["component"]
    assert_equal({ "id" => @map.id, "name" => "Domaine d'Ahinvaux", "role" => "owner" }, page["props"]["map"])
    assert page["props"]["canEdit"]
  end

  test "viewers open the dossier read only, without networks even when they ask" do
    sign_in_as users(:alice)
    get map_dossier_path(@map), headers: inertia_headers
    assert_not response.parsed_body["props"]["canEdit"]

    get map_dossier_path(@map, format: :json, networks: "1")
    assert_response :success
    json = response.parsed_body
    assert_equal({ "role" => "viewer", "canEdit" => false }, json["viewer"])
    assert_equal({ "included" => false, "count" => 0 }, json["networks"])
    assert_not_includes feature_ids, @pipe.id
    assert_includes feature_ids, map_features(:pond).id
  end

  test "networks only when an editor opts in" do
    sign_in_as users(:michael)
    get map_dossier_path(@map, format: :json)
    assert_not_includes feature_ids, @pipe.id
    assert_equal({ "included" => false, "count" => 1 }, response.parsed_body["networks"])

    get map_dossier_path(@map, format: :json, networks: "1")
    assert_includes feature_ids, @pipe.id
    assert response.parsed_body.dig("networks", "included")
  end

  test "beta: everything unlocked" do
    sign_in_as users(:alice)
    get map_dossier_path(@map, format: :json)
    json = response.parsed_body
    assert_equal({ "analyses" => true, "pdfExport" => true }, json["entitlements"])
    assert_equal "not_imported", json.dig("terrain", "relief", "reason")
    assert json.dig("climate", "projections", "available")
  end

  test "a free owner's map: analyses locked for everyone who opens it" do
    sign_in_as users(:alice)
    with_billing_enabled { get map_dossier_path(@map, format: :json) }
    json = response.parsed_body
    assert_equal({ "analyses" => false, "pdfExport" => false }, json["entitlements"])
    assert_equal({ "locked" => true }, json.dig("terrain", "relief"))
    assert json.dig("climate", "projections", "locked")
    assert json.dig("climate", "current", "available")
  end

  test "editors of a map over its owner's plan can still open the dossier (read is never blocked)" do
    sign_in_as users(:michael)
    Map.create!(name: "Plus ancienne", owner: users(:michael), region: regions(:wallonia), created_at: 1.year.ago)
    with_billing_enabled do
      assert @map.reload.read_only_by_plan?
      get map_dossier_path(@map, format: :json)
    end
    assert_response :success
  end
end
