require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

# Importing a drone view from a file: the editor announces it, sends it in
# parts to the upload endpoint, then asks for the conversion.
class Maps::AerialViewsControllerTest < ActionDispatch::IntegrationTest
  include DroneTestHelper
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    McpUpload.part_size_for_new = 1.megabyte
  end

  teardown { McpUpload.part_size_for_new = 32.megabytes }

  def announce(filename: "orthophoto 2027.tif", byte_size: 2.5.megabytes.to_i, name: "Vol de mai", captured_on: "2027-05-12")
    post map_aerial_views_path(@map), params: { aerial_view: { name:, captured_on: }, file: { filename:, byte_size: } }, as: :json
  end

  def send_parts(upload, bytes)
    (1..upload["partCount"]).each do |n|
      chunk = bytes.byteslice((n - 1) * upload["partSize"], upload["partSize"])
      put "#{upload['partsUrl']}/#{n}", params: chunk, headers: { "Content-Type" => "application/octet-stream", "Content-MD5" => Digest::MD5.base64digest(chunk) }
      assert_response :no_content
    end
  end

  test "an editor sends a large file in parts, then the conversion starts" do
    sign_in_as users(:michael)
    bytes = Random.bytes(2.5.megabytes.to_i)
    announce
    assert_response :created
    body = response.parsed_body
    view = AerialView.find(body.dig("aerialView", "id"))
    assert_equal [ "uploading", "orthophoto 2027.tif", "Vol de mai", true ], [ view.status, view.source_filename, view.name, view.imported? ]
    assert_nil view.url
    assert_equal "Vue drone © #{users(:michael).display_name}", view.attribution
    assert_equal [ 3, 1.megabyte ], body["upload"].values_at("partCount", "partSize")
    assert_match %r{\A/mcp/uploads/[^/]+/parts\z}, body.dig("upload", "partsUrl")

    post complete_map_aerial_view_path(@map, view), params: { checksum: Digest::MD5.base64digest(bytes) }, as: :json
    assert_response :unprocessable_content, "no part sent yet"
    assert_equal [ 1, 2, 3 ], response.parsed_body["missing"]

    send_parts(body["upload"], bytes)
    assert_enqueued_with(job: AerialViewImportJob, args: [ view ]) do
      post complete_map_aerial_view_path(@map, view), params: { checksum: Digest::MD5.base64digest(bytes) }, as: :json
    end
    assert_response :success
    assert_equal "processing", view.reload.status
    assert_equal Digest::MD5.base64digest(bytes), view.source_upload.blob.checksum
    assert view.source_upload.attached?, "kept from the purge from now on"
  end

  test "only drone files, and not beyond the limit" do
    sign_in_as users(:michael)
    announce(filename: "photo.jpg")
    assert_response :unprocessable_content
    assert_equal I18n.t("drone.import.errors.format"), response.parsed_body["message"]
    announce(byte_size: AerialView::MAX_UPLOAD_BYTES + 1)
    assert_response :unprocessable_content
    announce(captured_on: "")
    assert_response :unprocessable_content
    assert_equal 0, AerialView.count
    assert_equal 0, McpUpload.count, "nothing kept from a refused announce"
  end

  test "readers cannot import, people outside the map see nothing" do
    sign_in_as users(:alice)
    announce
    assert_response :forbidden
    sign_in_as users(:bob)
    announce
    assert_response :not_found
  end

  test "the editor follows the imports; removing one lets go of its parts" do
    sign_in_as users(:michael)
    staff = aerial_view(@map)
    view = imported_view(@map, users(:michael), bytes: Random.bytes(100.kilobytes))
    get map_aerial_views_path(@map), as: :json
    assert_equal [ view.id ], response.parsed_body["aerialViews"].map { _1["id"] }

    upload = view.source_upload
    delete map_aerial_view_path(@map, view), as: :json
    assert_response :success
    refute AerialView.exists?(view.id)
    refute McpUpload.exists?(upload.id)
    refute upload.blob.service.exist?(upload.part_key(1))

    delete map_aerial_view_path(@map, staff), as: :json
    assert_response :not_found, "views set up by Semisto stay with staff"
  end

  test "a view being prepared cannot be removed" do
    sign_in_as users(:michael)
    view = imported_view(@map, users(:michael), bytes: Random.bytes(10.kilobytes), status: "processing")
    delete map_aerial_view_path(@map, view), as: :json
    assert_response :conflict
  end

  test "everyone who sees the map reads a ready view's archive; the map gives it with the views" do
    view = imported_view(@map, users(:michael), bytes: Random.bytes(10.kilobytes), status: "ready")
    view.archive.attach(io: file_fixture("drone-view.pmtiles").open, filename: "vue.pmtiles", content_type: "application/vnd.pmtiles")
    sign_in_as users(:alice)
    get archive_map_aerial_view_path(@map, view)
    assert_response :redirect
    assert_match %r{/rails/active_storage/}, response.location

    get map_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal archive_map_aerial_view_path(@map, view), props["aerialViews"].sole["url"]
    assert_equal [], props["aerialImports"], "a reader does not follow imports"

    sign_in_as users(:michael)
    get map_path(@map), headers: inertia_headers
    assert_equal [ "ready" ], response.parsed_body.dig("props", "aerialImports").map { _1["status"] }
  end

  test "a view still on its way is not shown on the map" do
    view = imported_view(@map, users(:michael), bytes: Random.bytes(10.kilobytes), status: "processing")
    sign_in_as users(:michael)
    get map_path(@map), headers: inertia_headers
    assert_equal [], response.parsed_body.dig("props", "aerialViews")
    get archive_map_aerial_view_path(@map, view)
    assert_response :not_found
  end
end
