require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PhotoSketchesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @photo = create_photo
  end

  def stroke = { type: "line", color: "#ffffff", width: 0.006, points: [ [ 0.1, 0.2 ], [ 0.3, 0.4 ] ] }

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_photo_sketches_path(@map, @photo), as: :json
    assert_response :not_found
  end

  test "a viewer sees the sketches but cannot draw" do
    @photo.sketches.create!(name: "Haie", strokes: [ stroke.deep_stringify_keys ])
    sign_in_as users(:alice)
    get map_photo_sketches_path(@map, @photo), as: :json
    assert_response :success
    assert_equal [ "Haie" ], response.parsed_body["sketches"].map { |s| s["name"] }
    post map_photo_sketches_path(@map, @photo), params: { sketch: { strokes: [ stroke ] } }, as: :json
    assert_response :forbidden
  end

  test "an editor draws, names, redraws and deletes a sketch" do
    sign_in_as users(:michael)
    post map_photo_sketches_path(@map, @photo), params: { sketch: { strokes: [ stroke ] } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal "Esquisse 1", body["name"]
    assert_equal 0.006, body["strokes"].first["width"]
    assert_equal users(:michael).display_name, body["createdBy"]

    note = { type: "text", color: "#ffffff", size: 0.05, x: 0.4, y: 0.6, text: "Mare" }
    patch map_photo_sketch_path(@map, @photo, body["id"]), params: { sketch: { name: "Mare", strokes: [ stroke, note ], lock_version: body["lockVersion"] } }, as: :json
    assert_response :success
    assert_equal "Mare", response.parsed_body["name"]
    assert_equal %w[line text], response.parsed_body["strokes"].map { |s| s["type"] }

    delete map_photo_sketch_path(@map, @photo, body["id"]), as: :json
    assert_response :no_content
    assert_empty @photo.sketches.reload
  end

  test "a stale save gets the latest version back" do
    sketch = @photo.sketches.create!(name: "Haie", strokes: [])
    sketch.update!(name: "Haie vive")
    sign_in_as users(:michael)
    patch map_photo_sketch_path(@map, @photo, sketch), params: { sketch: { strokes: [ stroke ], lock_version: 0 } }, as: :json
    assert_response :conflict
    assert_equal "Haie vive", response.parsed_body["sketch"]["name"]
  end

  test "a malformed stroke is refused" do
    sign_in_as users(:michael)
    post map_photo_sketches_path(@map, @photo), params: { sketch: { strokes: [ { type: "line", color: "red" } ] } }, as: :json
    assert_response :unprocessable_entity
    assert_empty @photo.sketches
  end
end
