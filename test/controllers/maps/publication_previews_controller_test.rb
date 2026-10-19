require "test_helper"
require_relative "../../test_helpers/collab_test_helper"
require_relative "../../test_helpers/png_test_helper"

class Maps::PublicationPreviewsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @publication = MapPublication.publish!(@map, by: @owner, title: "Le verger")
  end

  test "the owner sends the painted preview; it becomes the link's image" do
    sign_in_as @owner
    post map_publication_preview_path(@map), params: { image: png_upload }, headers: { "Accept" => "application/json" }
    assert_response :success
    assert @publication.reload.preview_image.attached?
    assert_equal "/p/#{@publication.token}/preview.png?v=1", json["previewPath"]
  end

  test "only a PNG, and not too big" do
    sign_in_as @owner
    post map_publication_preview_path(@map), params: { image: png_upload("<svg/>", content_type: "image/png") }, headers: { "Accept" => "application/json" }
    assert_response :unprocessable_entity
    post map_publication_preview_path(@map), params: { image: png_upload(PngTestHelper::PNG_1PX + ("x" * MapPublication::PREVIEW_MAX_BYTES)) }, headers: { "Accept" => "application/json" }
    assert_response :unprocessable_entity
    assert_not @publication.reload.preview_image.attached?
  end

  test "owner only, and only while published" do
    editor = add_member(@map, make_user("Edith"), "editor")
    sign_in_as editor
    post map_publication_preview_path(@map), params: { image: png_upload }, headers: { "Accept" => "application/json" }
    assert_response :forbidden

    @publication.unpublish!
    sign_in_as @owner
    post map_publication_preview_path(@map), params: { image: png_upload }, headers: { "Accept" => "application/json" }
    assert_response :not_found
  end

  test "publishing again drops the old preview: it may show what the new snapshot hides" do
    @publication.preview_image.attach(io: StringIO.new(PngTestHelper::PNG_1PX), filename: "p.png", content_type: "image/png")
    MapPublication.publish!(@map, by: @owner)
    assert_not @publication.reload.preview_image.attached?
    assert_nil @publication.preview_path
  end
end
