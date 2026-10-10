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

  test "an editor notes a plant from its photo: the photo joins the map's photos at the same place" do
    sign_in_as users(:michael)
    assert_difference -> { @map.photos.count } => 1, -> { @map.bioindicator_observations.count } => 1 do
      post map_bioindicator_observations_path(@map), headers: json_headers, params: { bioindicator_observation: {
        catalog_key: "ortie", latin_name: "Urtica dioica", abundance: "frequent", lng: 4.906, lat: 50.341,
        location_source: "exif", photo_taken_at: "2026-05-17T14:32:10", photo_source: "web", photo: upload("terrain.jpg")
      } }
    end
    assert_response :created
    body = response.parsed_body
    photo = @map.photos.find(body["photoId"])
    assert_equal "Ortie dioïque", body["speciesName"]
    assert_equal "2026-05-17", body["observedOn"]
    assert_equal [ 4.906, 50.341 ], [ photo.lng, photo.lat ]
    assert_equal "exif", photo.location_source
    assert_equal "Ortie dioïque", photo.caption
    assert_equal users(:michael), photo.uploaded_by
  end

  test "a photo without a position takes the place the plant is given on the map" do
    sign_in_as users(:michael)
    post map_bioindicator_observations_path(@map), headers: json_headers, params: { bioindicator_observation: {
      species_name: "Grande ortie", abundance: "present", photo: upload("terrain.jpg")
    } }
    assert_response :created
    observation = @map.bioindicator_observations.find(response.parsed_body["id"])
    assert_nil observation.location
    assert_nil observation.photo.location

    patch map_bioindicator_observation_path(@map, observation), params: { bioindicator_observation: { lng: 4.907, lat: 50.342 } }, as: :json
    assert_response :success
    assert_equal [ 4.907, 50.342 ], [ observation.photo.reload.lng, observation.photo.lat ]
    assert_equal "map", observation.photo.location_source
  end

  test "the same photo sent twice is reused, not refused" do
    sign_in_as users(:michael)
    existing = create_photo
    assert_no_difference -> { @map.photos.count } do
      post map_bioindicator_observations_path(@map), headers: json_headers, params: { bioindicator_observation: {
        catalog_key: "ortie", abundance: "present", photo: upload("terrain.jpg")
      } }
    end
    assert_response :created
    assert_equal existing.id, response.parsed_body["photoId"]
  end

  test "a file that is not a photo saves nothing" do
    sign_in_as users(:michael)
    assert_no_difference -> { @map.photos.count + @map.bioindicator_observations.count } do
      post map_bioindicator_observations_path(@map), headers: json_headers, params: { bioindicator_observation: {
        catalog_key: "ortie", abundance: "present", photo: upload("notes.txt", "text/plain")
      } }
    end
    assert_response :unprocessable_entity
  end

  test "a photo of another map cannot be linked" do
    other = create_photo(map: Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia)))
    sign_in_as users(:michael)
    post map_bioindicator_observations_path(@map), params: { bioindicator_observation: { catalog_key: "ortie", map_photo_id: other.id } }, as: :json
    assert_response :not_found
  end

  test "deleting the photo keeps the observation" do
    photo = create_photo
    observation = @map.bioindicator_observations.create!(catalog_key: "ortie", photo:)
    photo.destroy!
    assert_nil observation.reload.map_photo_id
  end

  test "the AI's proposals are listed as drafts, count for nothing until accepted, and the photos left for it come along" do
    photo = create_photo
    photo.update!(bioindicator_status: "analyzed", bioindicator_summary: "Sol riche en azote, plutôt frais.")
    draft = @map.bioindicator_observations.create!(catalog_key: "ortie", photo:, status: "draft", source: "ai", confidence: "high", rationale: "Feuilles dentées au centre.")
    sign_in_as users(:michael)
    get map_bioindicator_observations_path(@map), as: :json
    body = response.parsed_body
    assert_equal "draft", body["observations"].sole["status"]
    assert_equal "ai", body["observations"].sole["source"]
    assert_equal [], body["summary"]
    assert_equal "Sol riche en azote, plutôt frais.", body["photos"].sole["bioindicatorSummary"]

    post accept_map_bioindicator_observation_path(@map, draft), as: :json
    assert_response :success
    assert_equal "active", draft.reload.status
    get map_bioindicator_observations_path(@map), as: :json
    assert_not_empty response.parsed_body["summary"]
  end

  test "a viewer cannot accept a proposal" do
    draft = @map.bioindicator_observations.create!(catalog_key: "ortie", status: "draft", source: "ai")
    sign_in_as users(:alice)
    post accept_map_bioindicator_observation_path(@map, draft), as: :json
    assert_response :forbidden
    assert draft.reload.draft?
  end
end
