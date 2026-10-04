require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PhotoAlbumsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  test "an editor creates, renames and deletes an album; its photos stay" do
    sign_in_as users(:michael)
    post map_photo_albums_path(@map), params: { photo_album: { name: "Verger, avant travaux" } }, as: :json
    assert_response :created
    id = response.parsed_body["id"]
    assert_equal 0, response.parsed_body["photosCount"]

    patch map_photo_album_path(@map, id), params: { photo_album: { name: "Verger 2026" } }, as: :json
    assert_equal "Verger 2026", response.parsed_body["name"]

    photo = create_photo(album: PhotoAlbum.find(id))
    delete map_photo_album_path(@map, id), as: :json
    assert_response :no_content
    assert_nil photo.reload.photo_album_id
  end

  test "an album needs a name" do
    sign_in_as users(:michael)
    post map_photo_albums_path(@map), params: { photo_album: { name: "" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "a viewer cannot manage albums" do
    sign_in_as users(:alice)
    post map_photo_albums_path(@map), params: { photo_album: { name: "Non" } }, as: :json
    assert_response :forbidden
  end
end
