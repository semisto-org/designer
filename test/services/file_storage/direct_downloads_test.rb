require "test_helper"

class FileStorage::DirectDownloadsTest < ActionDispatch::IntegrationTest
  Bucket = Struct.new(:bucket)

  test "a disk link is always direct, a bucket link only when the bucket sends CORS headers" do
    assert FileStorage.direct_downloads?(FileStorage.service(:test))
    assert_not FileStorage.direct_downloads?(Bucket.new("terranova-media"))
    ENV["S3_DIRECT_DOWNLOADS"] = "true"
    assert FileStorage.direct_downloads?(Bucket.new("terranova-media"))
  ensure
    ENV.delete("S3_DIRECT_DOWNLOADS")
  end

  test "the app streams a file itself, by byte range as pdf.js asks" do
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("%PDF-1.7 plan of the place"), filename: "plan.pdf", content_type: "application/pdf")
    get rails_storage_proxy_path(blob, expires_in: 5.minutes, disposition: :inline), headers: { "Range" => "bytes=0-7" }
    assert_response :partial_content
    assert_equal "%PDF-1.7", response.body
  end
end
