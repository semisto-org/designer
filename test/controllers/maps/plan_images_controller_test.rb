require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PlanImagesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  def pose = { center_lng: 4.9, center_lat: 50.34, width_m: 40, rotation: 0, aspect: 1.5 }

  def create_plan_image(**attrs)
    plan_image = @map.plan_images.new(name: "Esquisse", **pose, **attrs)
    plan_image.image.attach(io: file_fixture("terrain.jpg").open, filename: "terrain.jpg", content_type: "image/jpeg")
    plan_image.tap(&:save!)
  end

  test "someone outside the map gets nothing" do
    plan_image = create_plan_image
    sign_in_as users(:bob)
    get map_plan_images_path(@map), headers: json_headers
    assert_response :not_found
    get image_map_plan_image_path(@map, plan_image)
    assert_response :not_found
  end

  test "a viewer sees the plan images and their file, but changes nothing" do
    plan_image = create_plan_image
    sign_in_as users(:alice)
    get map_plan_images_path(@map), headers: json_headers
    assert_response :success
    assert_equal [ "Esquisse" ], response.parsed_body["planImages"].pluck("name")

    get image_map_plan_image_path(@map, plan_image)
    assert_response :redirect

    patch map_plan_image_path(@map, plan_image), params: { plan_image: { visible: false } }, as: :json
    assert_response :forbidden
    post map_plan_images_path(@map), params: { plan_image: { image: upload("terrain.jpg"), name: "x", **pose } }, headers: json_headers
    assert_response :forbidden
  end

  test "an editor imports an image where it was first placed" do
    sign_in_as users(:michael)
    assert_difference -> { @map.plan_images.count } do
      post map_plan_images_path(@map), params: { plan_image: { image: upload("terrain.jpg"), name: "Esquisse Beauvechain", **pose } }, headers: json_headers
    end
    assert_response :created
    body = response.parsed_body["planImage"]
    assert_equal "Esquisse Beauvechain", body["name"]
    assert_equal 40.0, body["widthM"]
    assert_equal 1.5, body["aspect"]
    assert_equal image_map_plan_image_path(@map, body["id"]), body["imageUrl"]
    assert_equal users(:michael), PlanImage.last.created_by
  end

  test "a file that is not an image is refused in French" do
    sign_in_as users(:michael)
    post map_plan_images_path(@map), params: { plan_image: { image: upload("rapport_labo.pdf"), name: "Rapport", **pose } }, headers: json_headers
    assert_response :unprocessable_entity
    assert_equal "Image doit être une image JPEG, PNG ou WebP", response.parsed_body["message"]
  end

  test "an editor moves, turns, fades and hides an image, never swaps its file" do
    plan_image = create_plan_image
    blob = plan_image.image.blob
    sign_in_as users(:michael)
    patch map_plan_image_path(@map, plan_image), params: {
      plan_image: { center_lng: 4.91, width_m: 55.5, rotation: -30, opacity: 0.4, visible: false, image: upload("plant.png") }
    }, headers: json_headers
    assert_response :success
    plan_image.reload
    assert_equal [ 4.91, 55.5, 330.0, 0.4, false ], [ plan_image.center_lng, plan_image.width_m, plan_image.rotation, plan_image.opacity, plan_image.visible ]
    assert_equal blob, plan_image.image.blob
  end

  test "a wrong pose is refused" do
    plan_image = create_plan_image
    sign_in_as users(:michael)
    patch map_plan_image_path(@map, plan_image), params: { plan_image: { width_m: -3 } }, as: :json
    assert_response :unprocessable_entity
    assert_equal 40.0, plan_image.reload.width_m
  end

  test "an editor deletes an image" do
    plan_image = create_plan_image
    sign_in_as users(:michael)
    delete map_plan_image_path(@map, plan_image), as: :json
    assert_response :success
    assert_empty response.parsed_body["planImages"]
    assert_not PlanImage.exists?(plan_image.id)
  end

  test "the editor receives the plan images with the map" do
    create_plan_image
    sign_in_as users(:alice)
    get map_path(@map), headers: { "X-Inertia" => "true", "X-Inertia-Version" => ViteRuby.digest }
    assert_equal [ "Esquisse" ], response.parsed_body.dig("props", "planImages").pluck("name")
  end
end
