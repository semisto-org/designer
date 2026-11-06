require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/soil_photos_helper"

# The photos of a soil sampling point, as the user's AI reads and links them.
class McpSoilSamplePhotosTest < ActionDispatch::IntegrationTest
  include McpTestHelper
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @sample = @map.soil_samples.create!(label: "Verger", status: "sampled", created_by: users(:michael))
    @bare = @map.soil_samples.create!(label: "Potager", status: "sampled", created_by: users(:michael))
    @hole = create_photo(salt: "hole", caption: "Le trou", soil_sample: @sample)
  end

  test "get_soil_samples gives each point's photos and counts the points still without one" do
    data, error = call_tool(@viewer, "get_soil_samples", { map_id: @map.id })
    refute error
    verger, potager = data["samples"]
    assert_equal [ { "photo_id" => @hole.id, "caption" => "Le trou", "kind" => "photo" } ], verger["photos"]
    assert_equal [], potager["photos"]
    assert_match(/Un point prélevé n'a encore aucune photo/, data["photos_note"])

    map_data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_equal 1, map_data["soil_samples"]["with_photos"]
  end

  test "list_photos filters by point and get_photo names it" do
    create_photo(salt: "other")
    data, = call_tool(@viewer, "list_photos", { map_id: @map.id, soil_sample_id: @sample.id })
    assert_equal [ @hole.id ], data["photos"].map { _1["id"] }
    photo, = call_tool(@viewer, "get_photo", { map_id: @map.id, photo_id: @hole.id })
    assert_equal @sample.id, photo["soil_sample_id"]
  end

  test "update_photos links a photo already on the map to a point, and null unlinks it" do
    photo = create_photo(salt: "core")
    data, error = call_tool(@owner, "update_photos", { map_id: @map.id, photos: [ { photo_id: photo.id, soil_sample_id: @bare.id } ] })
    refute error, data
    assert_equal @bare.id, photo.reload.soil_sample_id

    call_tool(@owner, "update_photos", { map_id: @map.id, photos: [ { photo_id: photo.id, soil_sample_id: nil } ] })
    assert_nil photo.reload.soil_sample_id

    message, error = call_tool(@owner, "update_photos", { map_id: @map.id, photos: [ { photo_id: photo.id, soil_sample_id: 999_999 } ] })
    assert error
    assert_match(/Point de prélèvement 999999 introuvable/, message)
  end
end
