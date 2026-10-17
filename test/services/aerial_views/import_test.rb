require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

class AerialViews::ImportTest < ActiveSupport::TestCase
  include DroneTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @user = users(:michael)
  end

  test "an orthophoto sent in parts becomes the view's archive; the parts go, its importer is told" do
    skip_without_imagery_tools
    view = imported_view(@map, @user, bytes: file_fixture("drone-ortho.tif").binread, status: "processing", part_size: 4.kilobytes)
    upload = view.source_upload
    assert_operator upload.part_count, :>, 1

    assert_enqueued_emails 1 do
      AerialViews::Import.new(view).call
    end
    view.reload
    assert_equal [ "ready", nil, "pmtiles" ], [ view.status, view.failure, view.kind ]
    assert view.archive.attached?
    assert_equal "webp", AerialViews::PmtilesHeader.read(ActiveStorage::Blob.service.path_for(view.archive.key)).tile_type
    assert_operator view.max_zoom, :>=, 18
    assert_in_delta 4.875, view.bounds["west"], 0.01
    refute McpUpload.exists?(upload.id)
    refute upload.blob.service.exist?(upload.part_key(1))
    assert_nil view.source_upload_id
    assert_empty Dir.children(AerialViews::Import.work_root).grep(/view-#{view.id}-/), "the working folder is removed"
  end

  test "a PMTiles archive is stored as it is" do
    view = imported_view(@map, @user, bytes: file_fixture("drone-view.pmtiles").binread, filename: "vol.pmtiles", status: "processing")
    AerialViews::Import.new(view).call
    assert_equal [ "ready", 17, 18 ], [ view.reload.status, view.min_zoom, view.max_zoom ]
    assert_equal file_fixture("drone-view.pmtiles").binread.b, view.archive.download.b
  end

  test "a file that is not a drone view fails with why, and lets go of what was sent" do
    view = imported_view(@map, @user, bytes: file_fixture("terrain.jpg").binread, status: "processing")
    upload = view.source_upload
    assert_no_enqueued_emails { AerialViews::Import.new(view).call }
    assert_equal [ "failed", "unsupported_format" ], [ view.reload.status, view.failure ]
    refute view.archive.attached?
    refute McpUpload.exists?(upload.id)
  end

  test "a file that does not match what the browser read is not converted" do
    view = imported_view(@map, @user, bytes: file_fixture("drone-view.pmtiles").binread, status: "processing", checksum: Digest::MD5.base64digest("autre"))
    AerialViews::Import.new(view).call
    assert_equal [ "failed", "upload_incomplete" ], [ view.reload.status, view.failure ]
  end

  test "the job only converts a view waiting for it" do
    view = imported_view(@map, @user, bytes: file_fixture("drone-view.pmtiles").binread, status: "uploading")
    AerialViewImportJob.perform_now(view)
    assert_equal "uploading", view.reload.status
    view.update!(status: "processing")
    AerialViewImportJob.perform_now(view)
    assert_equal "ready", view.reload.status
  end

  test "a file never finished is purged after a few days, and its view says so" do
    view = imported_view(@map, @user, bytes: Random.bytes(10.kilobytes))
    travel 2.days do
      McpUploadPurgeJob.perform_now
      assert_equal "uploading", view.reload.status, "a slow connection gets time"
    end
    travel(McpUpload::AERIAL_LIFETIME + 1.hour) do
      McpUploadPurgeJob.perform_now
    end
    assert_equal [ "failed", "upload_expired" ], [ view.reload.status, view.failure ]
    assert_nil view.source_upload_id
  end
end
