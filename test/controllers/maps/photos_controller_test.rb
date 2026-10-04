require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PhotosControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  def post_photo(file = "terrain.jpg", **fields)
    post map_photos_path(@map), params: { photo: { image: upload(file), **fields } }, headers: json_headers
  end

  test "requires sign in" do
    get map_photos_path(@map), headers: json_headers
    assert_redirected_to new_session_path
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_photos_path(@map), headers: json_headers
    assert_response :not_found
    post_photo
    assert_response :not_found
  end

  test "a viewer sees the photos, albums and limits" do
    create_photo(location: [ 4.9, 50.34 ], caption: "Verger")
    @map.photo_albums.create!(name: "Avant travaux")
    sign_in_as users(:alice)
    get map_photos_path(@map), headers: json_headers
    assert_response :success
    body = response.parsed_body
    assert_equal [ "Verger" ], body["photos"].map { |p| p["caption"] }
    assert_equal [ "Avant travaux" ], body["albums"].map { |a| a["name"] }
    assert_equal 25.megabytes, body["limits"]["maxBytes"]
    assert_equal %w[image/jpeg image/png image/webp], body["limits"]["contentTypes"]
  end

  test "a viewer cannot upload, edit or delete" do
    photo = create_photo
    sign_in_as users(:alice)
    post_photo
    assert_response :forbidden
    patch map_photo_path(@map, photo), params: { photo: { caption: "x" } }, as: :json
    assert_response :forbidden
    delete map_photo_path(@map, photo), as: :json
    assert_response :forbidden
    assert_equal 1, @map.photos.count
  end

  test "an editor uploads a photo without EXIF data: it is saved and waits to be placed" do
    sign_in_as users(:michael)
    assert_difference -> { @map.photos.count } do
      post_photo
    end
    assert_response :created
    body = response.parsed_body
    assert_nil body["lng"]
    assert_nil body["lat"]
    assert_nil body["locationSource"]
    assert_equal "web", body["source"]
    assert_equal "terrain.jpg", body["filename"]
    assert_equal users(:michael).display_name, body["uploadedBy"]
    assert @map.photos.unlocated.exists?
  end

  test "an editor uploads with the position, date and heading read from EXIF" do
    sign_in_as users(:michael)
    post_photo "terrain_gps.jpg", lng: 4.9075, lat: 50.341, location_source: "exif",
               taken_at: "2026-05-17T14:32:10", heading: 135, source: "phone", caption: "Vue vers le sud"
    assert_response :created
    body = response.parsed_body
    assert_in_delta 4.9075, body["lng"], 1e-6
    assert_in_delta 50.341, body["lat"], 1e-6
    assert_equal "exif", body["locationSource"]
    assert_equal 135, body["heading"]
    assert_equal "phone", body["source"]
    assert_equal "Vue vers le sud", body["caption"]
    assert_match(/\A2026-05-17T14:32:10/, body["takenAt"])
  end

  test "a collaborator who is only an editor can add too" do
    @map.memberships.create!(user: users(:bob), role: "editor")
    sign_in_as users(:bob)
    post_photo
    assert_response :created
    assert_equal users(:bob), MapPhoto.last.uploaded_by
  end

  test "refuses what is not an image, with a French message" do
    sign_in_as users(:michael)
    post_photo "notes.txt"
    assert_response :unprocessable_entity
    assert_match(/« notes\.txt » n'est pas une image acceptée/, response.parsed_body["message"])
    assert_equal "invalid", response.parsed_body["code"]
    assert_equal 0, @map.photos.count
  end

  test "refuses a photo over the size limit" do
    sign_in_as users(:michael)
    with_constant(MapPhoto, :MAX_BYTES, 500) do
      post_photo
    end
    assert_response :unprocessable_entity
    assert_match(/pèse .* Mo : la limite est de/, response.parsed_body["message"])
  end

  test "refuses a photo that is already on the map, flagged as a duplicate" do
    sign_in_as users(:michael)
    post_photo
    post_photo
    assert_response :unprocessable_entity
    assert_equal "duplicate", response.parsed_body["code"]
    assert_equal 1, @map.photos.count
  end

  test "a missing file is a clear error, not a crash" do
    sign_in_as users(:michael)
    post map_photos_path(@map), params: { photo: { caption: "rien" } }, headers: json_headers
    assert_response :unprocessable_entity
    assert_equal "Aucune photo n'a été reçue.", response.parsed_body["message"]
  end

  test "places a photo by clicking on the map, and moves it" do
    photo = create_photo
    sign_in_as users(:michael)
    patch map_photo_path(@map, photo), params: { photo: { lng: 4.91, lat: 50.342, location_source: "map" } }, as: :json
    assert_response :success
    assert_in_delta 4.91, response.parsed_body["lng"], 1e-6
    assert_equal "map", response.parsed_body["locationSource"]

    patch map_photo_path(@map, photo), params: { photo: { lng: nil, lat: nil } }, as: :json
    assert_nil response.parsed_body["lng"]
    assert_nil response.parsed_body["locationSource"]
  end

  test "edits caption, album, date and links a feature" do
    photo = create_photo
    album = @map.photo_albums.create!(name: "Verger")
    sign_in_as users(:michael)
    patch map_photo_path(@map, photo), params: { photo: { caption: "Le mur de pierres", photo_album_id: album.id, map_feature_id: map_features(:pond).id, taken_at: "2025-03-02T09:00:00" } }, as: :json
    assert_response :success
    photo.reload
    assert_equal "Le mur de pierres", photo.caption
    assert_equal album, photo.album
    assert_equal map_features(:pond), photo.map_feature
  end

  test "cannot use an album of another map" do
    other = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    foreign = other.photo_albums.create!(name: "Ailleurs")
    photo = create_photo
    sign_in_as users(:michael)
    patch map_photo_path(@map, photo), params: { photo: { photo_album_id: foreign.id } }, as: :json
    assert_response :unprocessable_entity
  end

  test "deletes a photo and its file" do
    photo = create_photo
    sign_in_as users(:michael)
    assert_difference -> { @map.photos.count }, -1 do
      delete map_photo_path(@map, photo), as: :json
    end
    assert_response :no_content
  end

  test "photos of another map cannot be reached through this one" do
    other = Map.create!(name: "Autre", owner: users(:michael), region: regions(:wallonia))
    foreign = create_photo(map: other)
    sign_in_as users(:michael)
    delete map_photo_path(@map, foreign), as: :json
    assert_response :not_found
    get image_map_photo_path(@map, foreign)
    assert_response :not_found
  end

  test "filters by album and by placement" do
    album = @map.photo_albums.create!(name: "Mare")
    in_album = create_photo(salt: 1, album:, location: [ 4.9, 50.34 ])
    create_photo(salt: 2)
    sign_in_as users(:alice)
    get map_photos_path(@map, album_id: album.id), headers: json_headers
    assert_equal [ in_album.id ], response.parsed_body["photos"].map { |p| p["id"] }
    get map_photos_path(@map, unplaced: 1), headers: json_headers
    assert_equal 1, response.parsed_body["photos"].size
    assert_nil response.parsed_body["photos"].first["lng"]
  end

  test "newest photos first, by the date they were taken" do
    older = create_photo(salt: 1, taken_at: "2024-01-01T10:00:00")
    newer = create_photo(salt: 2, taken_at: "2026-01-01T10:00:00")
    sign_in_as users(:alice)
    get map_photos_path(@map), headers: json_headers
    assert_equal [ newer.id, older.id ], response.parsed_body["photos"].map { |p| p["id"] }
  end

  test "inspector query: photos linked to a feature or within 15 m, with distances" do
    pond = map_features(:pond)
    east = 4.9052
    near = create_photo(salt: 1, location: [ east + meters_east(8), 50.3401 ])
    linked = create_photo(salt: 2, map_feature: pond)
    create_photo(salt: 3, location: [ east + meters_east(40), 50.3401 ])
    sign_in_as users(:alice)
    get map_photos_path(@map, feature_id: pond.id), headers: json_headers
    assert_response :success
    photos = response.parsed_body["photos"]
    assert_equal [ linked.id, near.id ], photos.map { |p| p["id"] }
    assert_in_delta 8, photos.last["distanceM"], 1
  end

  test "same spot candidates for the before/after slider" do
    before = create_photo(salt: 1, location: [ 4.9, 50.34 ], heading: 90)
    after = create_photo(salt: 2, location: [ 4.9 + meters_east(3), 50.34 ], heading: 95)
    create_photo(salt: 3, location: [ 4.9 + meters_east(300), 50.34 ], heading: 90)
    sign_in_as users(:alice)
    get same_spot_map_photo_path(@map, before), headers: json_headers
    assert_equal [ after.id ], response.parsed_body["photos"].map { |p| p["id"] }
  end

  test "image: a viewer is redirected to a short-lived link on the stored file; no variant is public" do
    photo = create_photo
    sign_in_as users(:alice)
    %w[thumb large original].each do |size|
      get image_map_photo_path(@map, photo, size:)
      assert_response :redirect, size
      assert_match %r{/rails/active_storage/disk/}, response.location, size
      assert_match(/private/, response.headers["Cache-Control"])
    end
  end

  test "image: the original, EXIF and GPS included, goes to editors only" do
    photo = create_photo(file: "terrain_gps.jpg")
    served_key = lambda do
      encoded = response.location[%r{/disk/([^/]+)/}, 1]
      data = ActiveStorage.verifier.verified(encoded, purpose: :blob_key)
      data[:key] || data["key"]
    end

    sign_in_as users(:alice)
    get image_map_photo_path(@map, photo, size: "original", download: 1)
    assert_response :redirect
    assert_not_equal photo.image.blob.key, served_key.call, "a viewer must get the stripped variant"

    sign_in_as users(:michael)
    get image_map_photo_path(@map, photo, size: "original", download: 1)
    assert_response :redirect
    assert_equal photo.image.blob.key, served_key.call
  end

  test "image: signed out or outside the map, no link" do
    photo = create_photo
    get image_map_photo_path(@map, photo, size: "thumb")
    assert_redirected_to new_session_path
    sign_in_as users(:bob)
    get image_map_photo_path(@map, photo, size: "thumb")
    assert_response :not_found
  end

  test "the thumbnail is a small JPEG without metadata" do
    photo = create_photo(file: "terrain_gps.jpg")
    variant = photo.image.variant(:thumb).processed
    image = Vips::Image.new_from_buffer(variant.download, "")
    assert_operator [ image.width, image.height ].max, :<=, 480
    assert_not_includes image.get_fields, "exif-ifd0-Make" # no camera metadata
    assert_not_includes image.get_fields, "exif-ifd3-GPSLatitude"
    assert_equal "image/jpeg", variant.image.blob.content_type
  end
end
