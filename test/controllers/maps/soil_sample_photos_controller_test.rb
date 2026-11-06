require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::SoilSamplePhotosControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  def bobs_map = @bobs_map ||= Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia))

  setup do
    @map = maps(:ahinvaux)
    @sample = @map.soil_samples.create!(label: "Verger", location: [ 4.9, 50.34 ], status: "sampled", created_by: users(:michael))
  end

  test "the candidates come linked first, then the closest to the point, then those without a place" do
    far = create_photo(salt: "far", location: MapPhoto.point_from(4.9 + meters_east(200), 50.34))
    near = create_photo(salt: "near", location: MapPhoto.point_from(4.9 + meters_east(3), 50.34))
    nowhere = create_photo(salt: "nowhere")
    linked = create_photo(salt: "linked", soil_sample: @sample, location: MapPhoto.point_from(4.9 + meters_east(500), 50.34))

    sign_in_as users(:alice)
    get map_soil_sample_photos_path(@map, @sample), as: :json
    assert_response :success
    photos = response.parsed_body["photos"]
    assert_equal [ linked.id, near.id, far.id, nowhere.id ], photos.map { _1["id"] }
    assert_equal 3, photos.second["distanceM"]
    assert_equal @sample.id, photos.first["soilSampleId"]
  end

  test "an editor sets the point's photos to exactly the ones chosen" do
    kept = create_photo(salt: "kept", soil_sample: @sample)
    dropped = create_photo(salt: "dropped", soil_sample: @sample)
    other_point = @map.soil_samples.create!(label: "Potager", created_by: users(:michael))
    moved = create_photo(salt: "moved", soil_sample: other_point)
    elsewhere = create_photo(map: bobs_map, salt: "elsewhere")

    sign_in_as users(:michael)
    put map_soil_sample_photos_path(@map, @sample), params: { photo_ids: [ kept.id, moved.id, elsewhere.id ] }, as: :json
    assert_response :success
    assert_equal [ kept.id, moved.id ].sort, response.parsed_body["photos"].map { _1["id"] }.sort
    assert_nil dropped.reload.soil_sample_id
    assert_equal @sample.id, moved.reload.soil_sample_id
    assert_nil elsewhere.reload.soil_sample_id
  end

  test "a viewer reads the photos of a point but never links one" do
    photo = create_photo(salt: "v")
    sign_in_as users(:alice)
    put map_soil_sample_photos_path(@map, @sample), params: { photo_ids: [ photo.id ] }, as: :json
    assert_response :forbidden
    assert_nil photo.reload.soil_sample_id
  end

  test "a photo sent from the point is linked to it and listed with the point" do
    sign_in_as users(:michael)
    post map_photos_path(@map), params: { photo: { image: upload("terrain.jpg"), soil_sample_id: @sample.id, lng: 4.9, lat: 50.34, location_source: "map" } }, headers: json_headers
    assert_response :created
    assert_equal @sample.id, response.parsed_body["soilSampleId"]

    get map_soil_samples_path(@map), as: :json
    assert_equal [ MapPhoto.last.id ], response.parsed_body["samples"].sole["photos"].map { _1["id"] }
  end

  test "a photo cannot be linked to a point of another map, and deleting the point keeps its photos" do
    photo = create_photo(salt: "keep")
    photo.soil_sample = bobs_map.soil_samples.create!(label: "Ailleurs")
    refute photo.valid?
    assert_includes photo.errors.full_messages, "Ce point de prélèvement appartient à une autre carte."
    photo.update!(soil_sample: @sample)
    @sample.destroy!
    assert MapPhoto.exists?(photo.id)
    assert_nil photo.reload.soil_sample_id
  end
end
