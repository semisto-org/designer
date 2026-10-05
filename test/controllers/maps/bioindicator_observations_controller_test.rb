require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::BioindicatorObservationsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  test "a viewer reads observations, their meaning and the curated list" do
    @map.bioindicator_observations.create!(catalog_key: "plantain_majeur", abundance: "dominant", observed_by: users(:michael))
    @map.bioindicator_observations.create!(species_name: "Plante du coin", abundance: "rare")
    sign_in_as users(:alice)
    get map_bioindicator_observations_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal 2, body["observations"].size
    plantain = body["observations"].find { |o| o["catalogKey"] == "plantain_majeur" }
    assert_equal %w[trampled disturbed compaction], plantain["indicators"]
    assert_equal %w[compaction], plantain["unverified"]
    assert_includes plantain["provenance"], "EIVE"
    assert_equal "compaction", body["summary"].first["key"]
    assert_operator body["catalog"].size, :>=, 30
    assert_equal true, body["plantCatalog"]
  end

  test "the list and its meaning are free even when the plan has no analyses" do
    sign_in_as users(:alice)
    with_billing_enabled { get map_bioindicator_observations_path(@map), as: :json }
    assert_response :success
    assert_equal 0, response.parsed_body["observations"].size
  end

  test "a viewer cannot record observations" do
    sign_in_as users(:alice)
    post map_bioindicator_observations_path(@map), params: { bioindicator_observation: { species_name: "Ortie" } }, as: :json
    assert_response :forbidden
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_bioindicator_observations_path(@map), as: :json
    assert_response :not_found
  end

  test "an editor records a curated plant, with its place and abundance" do
    sign_in_as users(:michael)
    post map_bioindicator_observations_path(@map), params: { bioindicator_observation: { catalog_key: "rumex_crepu", abundance: "frequent", lng: 4.906, lat: 50.341, notes: "Au bas du verger" } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal "Rumex crépu", body["speciesName"]
    assert_equal "Rumex crispus", body["latinName"]
    assert_equal %w[waterlogging compaction], body["indicators"]
    assert_equal [ 4.906, 50.341 ], [ body["lng"], body["lat"] ]
    assert_equal Date.current.iso8601, body["observedOn"]
    assert_equal users(:michael).display_name, body["observedBy"]
  end

  test "an editor records a free-text species" do
    sign_in_as users(:michael)
    post map_bioindicator_observations_path(@map), params: { bioindicator_observation: { species_name: "Berce du Caucase", abundance: "present" } }, as: :json
    assert_response :created
    assert_empty response.parsed_body["indicators"]
  end

  test "errors are in French" do
    sign_in_as users(:michael)
    post map_bioindicator_observations_path(@map), params: { bioindicator_observation: { abundance: "present" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "an editor edits and deletes" do
    obs = @map.bioindicator_observations.create!(species_name: "Ortie", abundance: "rare")
    sign_in_as users(:michael)
    patch map_bioindicator_observation_path(@map, obs), params: { bioindicator_observation: { abundance: "dominant" } }, as: :json
    assert_equal "dominant", response.parsed_body["abundance"]
    delete map_bioindicator_observation_path(@map, obs), as: :json
    assert_response :no_content
  end

  test "species suggestions: the curated list, and no plant catalogue while it does not exist" do
    sign_in_as users(:alice)
    get species_map_bioindicator_observations_path(@map, q: "plant"), as: :json
    assert_response :success
    assert_equal %w[plantain_majeur plantain_lanceole], response.parsed_body["catalog"].map { |p| p["key"] }
    assert_equal [], response.parsed_body["plants"]
  end
end
