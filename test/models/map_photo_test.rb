require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class MapPhotoTest < ActiveSupport::TestCase
  include SoilPhotosHelper

  test "a photo without any EXIF data is valid and waits to be placed" do
    photo = create_photo
    assert_nil photo.location
    assert_nil photo.location_source
    assert_nil photo.taken_at
    assert_includes MapPhoto.unlocated, photo
    assert photo.image.attached?
  end

  test "keeps the position and the date read from the EXIF block" do
    photo = create_photo(file: "terrain_gps.jpg", location: [ 4.9075, 50.341 ], location_source: "exif",
                         taken_at: "2026-05-17T14:32:10", heading: 135)
    photo.reload
    assert_in_delta 4.9075, photo.lng, 1e-6
    assert_in_delta 50.341, photo.lat, 1e-6
    assert_equal "exif", photo.location_source
    assert_equal 4326, photo.location.srid
    assert_equal 14, photo.taken_at.hour
    assert_equal "Brussels", photo.taken_at.time_zone.name
  end

  test "location source is cleared when the photo has no position" do
    photo = create_photo(location_source: "map")
    assert_nil photo.location_source
  end

  test "accepts a GeoJSON point, an array and rejects coordinates outside the world" do
    assert_equal [ 4.9, 50.3 ], build_photo(location: { "type" => "Point", "coordinates" => [ 4.9, 50.3 ] }).lnglat
    assert_equal [ 4.9, 50.3 ], build_photo(location: [ 4.9, 50.3 ]).lnglat
    far = build_photo(location: [ 200, 50 ])
    assert_not far.valid?
  end

  test "only images are accepted, with a French error naming the file" do
    photo = build_photo(file: "notes.txt", type: "text/plain")
    assert_not photo.valid?
    assert_match(/« notes\.txt » n'est pas une image acceptée/, photo.errors.full_messages.to_sentence)
    assert_match(/JPEG, PNG ou WebP/, photo.errors.full_messages.to_sentence)
  end

  test "a file is judged by its content, not by the type the browser declared" do
    photo = build_photo(file: "notes.txt", type: "image/jpeg")
    assert_not photo.valid?
  end

  test "png is accepted" do
    assert build_photo(file: "terrain.png", type: "image/png").valid?
  end

  test "refuses a photo over the size limit, with the sizes in French" do
    photo = build_photo
    photo.image.blob.byte_size = 31.megabytes + 400.kilobytes
    assert_not photo.valid?
    assert_includes photo.errors.full_messages.to_sentence, "« terrain.jpg » pèse 31 Mo : la limite est de 25 Mo par photo."
  end

  test "sizes under ten megabytes keep one decimal, with a comma" do
    with_constant(MapPhoto, :MAX_BYTES, 1_500_000) do
      photo = build_photo
      photo.image.blob.byte_size = 2_700_000
      photo.valid?
      assert_includes photo.errors.full_messages.to_sentence, "pèse 2,6 Mo : la limite est de 1,4 Mo"
    end
  end

  test "the same file is not imported twice on one map, but may live on another" do
    create_photo
    twin = build_photo
    assert_not twin.valid?
    assert twin.errors.of_kind?(:base, :already_imported)
    assert_includes twin.errors.full_messages.to_sentence, "« terrain.jpg » est déjà dans cette carte."

    other_map = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    assert build_photo(map: other_map).valid?
  end

  test "heading is brought back to 0-360 degrees" do
    assert_equal 10, build_photo(heading: 370).tap(&:valid?).heading
    assert_equal 350, build_photo(heading: -10).tap(&:valid?).heading
  end

  test "album and feature must belong to the same map" do
    other_map = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    album = other_map.photo_albums.create!(name: "Ailleurs")
    photo = build_photo(album:)
    assert_not photo.valid?
    assert_includes photo.errors.full_messages.to_sentence, "autre carte"
  end

  test "deleting an album keeps its photos" do
    album = maps(:ahinvaux).photo_albums.create!(name: "Verger")
    photo = create_photo(album:)
    album.destroy!
    assert_nil photo.reload.photo_album_id
  end

  test "around_feature finds linked photos and photos within 15 m of the geometry" do
    pond = map_features(:pond) # polygon from 4.905 to 4.9052, 50.340 to 50.3402
    east = pond.geometry.envelope.exterior_ring.points.map(&:x).max
    inside = create_photo(salt: 1, location: [ 4.9051, 50.3401 ])
    near = create_photo(salt: 2, location: [ east + meters_east(10), 50.3401 ])
    far = create_photo(salt: 3, location: [ east + meters_east(30), 50.3401 ])
    linked = create_photo(salt: 4, map_feature: pond)
    elsewhere = create_photo(salt: 5, location: [ 4.95, 50.4 ])

    found = MapPhoto.around_feature(pond).index_by(&:id)
    assert_equal [ inside, near, linked ].map(&:id).sort, found.keys.sort
    assert_equal 0, found[inside.id][:distance_m].to_f.round
    assert_in_delta 10, found[near.id][:distance_m], 1
    assert_nil found[linked.id][:distance_m]
    assert_not_includes found.keys, far.id
    assert_not_includes found.keys, elsewhere.id
  end

  test "around_feature never leaks photos of another map" do
    pond = map_features(:pond)
    other_map = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    create_photo(map: other_map, location: [ 4.9051, 50.3401 ])
    assert_empty MapPhoto.around_feature(pond)
  end

  test "same_spot suggests photos of the same place with a similar heading, closest first" do
    before = create_photo(salt: 1, location: [ 4.9, 50.34 ], heading: 90, taken_at: "2024-04-10T10:00:00")
    after = create_photo(salt: 2, location: [ 4.9 + meters_east(4), 50.34 ], heading: 100, taken_at: "2026-04-10T10:00:00")
    other_way = create_photo(salt: 3, location: [ 4.9 + meters_east(2), 50.34 ], heading: 270)
    unknown_heading = create_photo(salt: 4, location: [ 4.9 + meters_east(8), 50.34 ])
    too_far = create_photo(salt: 5, location: [ 4.9 + meters_east(60), 50.34 ], heading: 90)

    ids = before.same_spot.map(&:id)
    assert_equal [ after.id, unknown_heading.id ], ids
    assert_not_includes ids, other_way.id
    assert_not_includes ids, too_far.id
    assert_not_includes ids, before.id
  end

  test "payload carries the position, the date and no file path" do
    photo = create_photo(location: [ 4.9, 50.34 ], taken_at: "2026-05-17T14:32:10", caption: "Le verger au printemps")
    payload = photo.as_inertia
    assert_equal "Le verger au printemps", payload[:caption]
    assert_equal [ 4.9, 50.34 ], [ payload[:lng], payload[:lat] ]
    assert_equal "terrain.jpg", payload[:filename]
    assert_match(/\A2026-05-17T14:32:10/, payload[:takenAt])
    assert_nil payload[:distanceM]
  end
end
