require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/soil_photos_helper"

# The user's AI looks at, adds, files and deletes the photos of the terrain.
class McpPhotosTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @stranger = personal_token(users(:bob))
  end

  test "list_photos gives the photos, newest first, with their albums; get_photo shows one" do
    album = @map.photo_albums.create!(name: "Verger")
    old = create_photo(taken_at: Time.zone.parse("2025-05-01 10:00"), caption: "Avant", album:, location: MapPhoto.point_from(4.906, 50.341))
    recent = create_photo(salt: 1, taken_at: Time.zone.parse("2026-05-01 10:00"))
    data, error = call_tool(@viewer, "list_photos", { map_id: @map.id })
    refute error
    assert_equal [ recent.id, old.id ], data["photos"].map { _1["id"] }
    assert_equal [ "Avant", { "id" => album.id, "name" => "Verger" }, [ 4.906, 50.341 ] ], data["photos"].last.values_at("caption", "album", "location")
    assert_equal [ { "id" => album.id, "name" => "Verger", "photos" => 1 } ], data["albums"]
    refute data.dig("can", "add_edit_delete")

    data, = call_tool(@viewer, "list_photos", { map_id: @map.id, unplaced: true })
    assert_equal [ recent.id ], data["photos"].map { _1["id"] }
    data, = call_tool(@viewer, "list_photos", { map_id: @map.id, limit: 1 })
    assert_equal recent.id, data["next_after_id"]
    data, = call_tool(@viewer, "list_photos", { map_id: @map.id, after_id: recent.id })
    assert_equal [ old.id ], data["photos"].map { _1["id"] }

    body = mcp_request(@viewer, "tools/call", { name: "get_photo", arguments: { map_id: @map.id, photo_id: old.id } })
    assert_equal "image/jpeg", body.dig("result", "content").find { _1["type"] == "image" }["mimeType"]
    assert_equal "Avant", body.dig("result", "structuredContent", "caption")

    _, error = call_tool(@stranger, "list_photos", { map_id: @map.id })
    assert error
  end

  test "add_photo adds a placed, dated photo in a new album, and refuses a twin" do
    bytes = file_fixture("terrain.jpg").binread
    data, error = call_tool(@owner, "add_photo", {
      map_id: @map.id, image_base64: "data:image/jpeg;base64,#{Base64.strict_encode64(bytes)}", filename: "Verger nord.jpg",
      caption: "Le verger au printemps", taken_at: "2026-04-20T09:30:00+02:00", location: [ 4.906, 50.341 ], heading: 90,
      album_name: "Printemps"
    })
    refute error
    photo = @map.photos.find(data["id"])
    assert_equal [ "verger-nord.jpg", "Le verger au printemps", "Printemps", 90.0, "manual", users(:michael) ],
      [ photo.image.filename.to_s, photo.caption, photo.album.name, photo.heading, photo.location_source, photo.uploaded_by ]
    assert_equal Time.zone.parse("2026-04-20 07:30 UTC"), photo.taken_at
    assert_nil AiAction.last.arguments["image_base64"], "the image is not copied into the journal"

    text, error = call_tool(@owner, "add_photo", { map_id: @map.id, image_base64: Base64.strict_encode64(bytes) })
    assert error
    assert_match(/déjà/, text)
    text, error = call_tool(@owner, "add_photo", { map_id: @map.id, image_base64: Base64.strict_encode64("pas une image du tout") })
    assert error
    assert_match(/n'est pas une image/, text)
    text, error = call_tool(@viewer, "add_photo", { map_id: @map.id, image_base64: Base64.strict_encode64(bytes) })
    assert error
    assert_match(/éditeurs/, text)
  end

  test "update_photos captions, places and files photos; null clears" do
    photo = create_photo(caption: "Ancienne")
    album = @map.photo_albums.create!(name: "Mare")
    data, error = call_tool(@owner, "update_photos", { map_id: @map.id, photos: [
      { photo_id: photo.id, caption: "La mare en hiver", location: [ 4.905, 50.3405 ], album_id: album.id },
      { photo_id: 999_999, caption: "x" },
      { photo_id: photo.id, location: [ 500, 0 ] }
    ] })
    refute error
    photo.reload
    assert_equal [ "La mare en hiver", album, [ 4.905, 50.3405 ] ], [ photo.caption, photo.album, photo.lnglat ]
    assert_equal 2, data["rejected"].size

    _, error = call_tool(@owner, "update_photos", { map_id: @map.id, photos: [ { photo_id: photo.id, caption: nil, location: nil, album_id: nil } ] })
    refute error
    photo.reload
    assert_equal [ nil, nil, nil ], [ photo.caption, photo.album, photo.location ]

    _, error = call_tool(@viewer, "update_photos", { map_id: @map.id, photos: [ { photo_id: photo.id, caption: "x" } ] })
    assert error
  end

  test "delete_photos deletes the photos named, for editors only" do
    photo = create_photo
    kept = create_photo(salt: 1)
    _, error = call_tool(@viewer, "delete_photos", { map_id: @map.id, photo_ids: [ photo.id ] })
    assert error
    assert MapPhoto.exists?(photo.id)

    with_billing do
      text, error = call_tool(@owner, "delete_photos", { map_id: @map.id, photo_ids: [ photo.id ] })
      assert error
      assert_match(/forfait/, text)
    end

    data, error = call_tool(@owner, "delete_photos", { map_id: @map.id, photo_ids: [ photo.id, 999_999 ] })
    refute error
    assert_equal [ [ photo.id ], [ 999_999 ], 1 ], data.values_at("deleted", "not_found", "photos_left")
    refute MapPhoto.exists?(photo.id)
    assert MapPhoto.exists?(kept.id)
    assert_equal({ "deleted" => 1, "photo_ids" => [ photo.id ] }, AiAction.last.result)
  end
end
