require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::PhotoRenderingsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper
  include ActiveJob::TestHelper

  setup do
    ENV["MAGNIFIC_API_KEY"] = "secret"
    @map = maps(:ahinvaux)
    @photo = create_photo
    @sketch = @photo.sketches.create!(name: "Mares", strokes: [])
  end

  teardown { ENV.delete("MAGNIFIC_API_KEY") }

  def ask(**params)
    post map_photo_renderings_path(@map, @photo), params: { style: "watercolor", input: upload("terrain.jpg"), **params }, headers: json_headers
  end

  test "an editor asks for an image, then follows it until it is done" do
    sign_in_as users(:michael)
    assert_enqueued_with(job: PhotoRenderingJob) { ask(sketch_id: @sketch.id, instructions: "orange = sentier") }
    assert_response :accepted
    body = response.parsed_body
    assert_equal [ "queued", "watercolor", @sketch.id, "orange = sentier" ], body.values_at("status", "style", "sketchId", "instructions")

    rendering = PhotoRendering.find(body["id"])
    rendering.complete!(StringIO.new(file_fixture("terrain_later.jpg").binread), content_type: "image/jpeg")
    get map_photo_rendering_path(@map, @photo, rendering), headers: json_headers
    assert_response :success
    assert_equal "done", response.parsed_body["status"]
    assert_equal @photo.id, response.parsed_body.dig("resultPhoto", "derivedFromId")

    get map_photo_renderings_path(@map, @photo), headers: json_headers
    info = response.parsed_body
    assert info["available"]
    assert info["allowed"]
    assert_equal PhotoRendering::MONTHLY_LIMIT - 1, info["remaining"]
    assert_equal [ rendering.id ], info["renderings"].map { |r| r["id"] }
    assert info["renderings"].first["resultPhoto"]
  end

  test "a viewer sees the renderings but cannot ask for one" do
    sign_in_as users(:alice)
    get map_photo_renderings_path(@map, @photo), headers: json_headers
    assert_response :success
    ask
    assert_response :forbidden
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_photo_renderings_path(@map, @photo), headers: json_headers
    assert_response :not_found
  end

  test "refused without the service, without the plan or past the monthly limit" do
    sign_in_as users(:michael)
    ENV.delete("MAGNIFIC_API_KEY")
    ask
    assert_response :service_unavailable
    assert_equal "not_configured", response.parsed_body["code"]
    ENV["MAGNIFIC_API_KEY"] = "secret"

    with_billing_enabled do
      ask
      assert_response :forbidden
      assert_equal "plan", response.parsed_body["code"]
    end

    now = Time.current
    PhotoRendering.insert_all(Array.new(PhotoRendering::MONTHLY_LIMIT) {
      { map_id: @map.id, map_photo_id: @photo.id, style: "photo", status: "done", created_at: now, updated_at: now }
    })
    ask
    assert_response :too_many_requests
    assert_equal "monthly_limit", response.parsed_body["code"]
  end

  test "a request without an image or with an unknown style is refused" do
    sign_in_as users(:michael)
    post map_photo_renderings_path(@map, @photo), params: { style: "watercolor" }, headers: json_headers
    assert_response :unprocessable_entity
    ask(style: "oil")
    assert_response :unprocessable_entity
    assert_equal "invalid", response.parsed_body["code"]
  end
end
