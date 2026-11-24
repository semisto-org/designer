require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

# A large video from the « Photos » panel: announced, sent in parts small
# enough for any proxy, put together in the background, then read back.
class Maps::PhotoUploadsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @bytes = file_fixture("terrain.mp4").binread
    McpUpload.web_photo_part_size = 1000
  end

  teardown { McpUpload.web_photo_part_size = 8.megabytes }

  def announce(byte_size: @bytes.bytesize, content_type: "video/mp4", filename: "Lautenne.mp4")
    post map_photo_uploads_path(@map), params: { file: { filename:, byte_size:, content_type: } }, as: :json
  end

  def send_parts(upload, bytes = @bytes)
    (1..upload["partCount"]).each do |n|
      chunk = bytes.byteslice((n - 1) * upload["partSize"], upload["partSize"])
      put "#{upload['partsUrl']}/#{n}", params: chunk, headers: { "Content-Type" => "application/octet-stream", "Content-MD5" => Digest::MD5.base64digest(chunk) }
      assert_response :no_content
    end
  end

  test "an editor sends a video in parts; it becomes a photo with what was typed" do
    sign_in_as users(:michael)
    announce
    assert_response :created
    upload = response.parsed_body["upload"]
    assert_equal [ 3, 1000 ], upload.values_at("partCount", "partSize")
    send_parts(upload)

    post complete_map_photo_upload_path(@map, upload["id"]), params: {
      checksum: Digest::MD5.base64digest(@bytes), photo: { caption: "Analyse de sol", lng: "4.9", lat: "50.34", location_source: "map", source: "web" }
    }, as: :json
    assert_response :accepted
    assert_equal "processing", response.parsed_body["status"]

    perform_enqueued_jobs(only: PhotoUploadJob)
    get map_photo_upload_path(@map, upload["id"]), as: :json
    body = response.parsed_body
    assert_equal "done", body["status"]
    photo = @map.photos.find(body.dig("photo", "id"))
    assert_equal [ "video", "Analyse de sol", users(:michael) ], [ photo.kind, photo.caption, photo.uploaded_by ]
    assert_in_delta 4.9, photo.location.x, 1e-6
    assert_equal @bytes, photo.image.download
    assert_equal Digest::MD5.base64digest(@bytes), photo.image.blob.checksum
    upload_row = McpUpload.find(upload["id"])
    assert upload_row.attached?
    assert_empty (1..3).select { upload_row.blob.service.exist?(upload_row.part_key(_1)) }, "parts are gone once put together"
  end

  test "a file that does not match its MD5 is refused, and says so" do
    sign_in_as users(:michael)
    announce
    upload = response.parsed_body["upload"]
    send_parts(upload)
    post complete_map_photo_upload_path(@map, upload["id"]), params: { checksum: Digest::MD5.base64digest("autre chose") }, as: :json
    perform_enqueued_jobs(only: PhotoUploadJob)
    get map_photo_upload_path(@map, upload["id"]), as: :json
    assert_equal [ "failed", I18n.t("soil_photos.errors.checksum_mismatch") ], response.parsed_body.values_at("status", "message")
    assert_not @map.photos.exists?
  end

  test "complete before every part arrived names the missing ones" do
    sign_in_as users(:michael)
    announce
    upload = response.parsed_body["upload"]
    put "#{upload['partsUrl']}/1", params: @bytes.byteslice(0, 1000), headers: { "Content-Type" => "application/octet-stream" }
    post complete_map_photo_upload_path(@map, upload["id"]), params: { checksum: Digest::MD5.base64digest(@bytes) }, as: :json
    assert_response :unprocessable_content
    assert_equal [ 2, 3 ], response.parsed_body["missing"]
    assert_no_enqueued_jobs only: PhotoUploadJob
  end

  test "refused before a byte travels: not a video, too heavy" do
    sign_in_as users(:michael)
    announce(content_type: "application/pdf", filename: "rapport.pdf")
    assert_response :unprocessable_content
    assert_match "rapport.pdf", response.parsed_body["message"]
    announce(byte_size: 2.gigabytes)
    assert_response :unprocessable_content
    assert_match "1 Go", response.parsed_body["message"]
    assert_equal 0, McpUpload.count
  end

  test "a viewer cannot send, and nobody follows someone else's upload" do
    sign_in_as users(:alice)
    announce
    assert_response :forbidden
    sign_in_as users(:michael)
    announce
    id = response.parsed_body.dig("upload", "id")
    sign_in_as users(:alice)
    get map_photo_upload_path(@map, id), as: :json
    assert_response :not_found
  end
end
