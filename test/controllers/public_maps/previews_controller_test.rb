require "test_helper"
require_relative "../../test_helpers/png_test_helper"

class PublicMaps::PreviewsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @publication = MapPublication.publish!(@map, by: users(:michael), title: "Le verger")
  end

  test "no account needed: the painted preview is served as a PNG" do
    @publication.preview_image.attach(io: StringIO.new(PngTestHelper::PNG_1PX), filename: "p.png", content_type: "image/png")
    get public_map_preview_path(@publication.token, v: 1)
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal PngTestHelper::PNG_1PX.b, response.body.b
    assert_match(/public/, response.headers["Cache-Control"])
  end

  test "none painted yet: 404; unpublished: 410" do
    get public_map_preview_path(@publication.token)
    assert_response :not_found
    @publication.preview_image.attach(io: StringIO.new(PngTestHelper::PNG_1PX), filename: "p.png", content_type: "image/png")
    @publication.unpublish!
    get public_map_preview_path(@publication.token)
    assert_response :gone
  end
end
