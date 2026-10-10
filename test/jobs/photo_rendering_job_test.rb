require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class PhotoRenderingJobTest < ActiveJob::TestCase
  include SoilPhotosHelper

  URL = "https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro".freeze

  setup do
    ENV["MAGNIFIC_API_KEY"] = "secret"
    @photo = create_photo
    @rendering = @photo.renderings.new(style: "photo", requested_by: users(:michael))
    @rendering.input.attach(io: file_fixture("terrain.jpg").open, filename: "in.jpg", content_type: "image/jpeg")
    @rendering.save!
  end

  teardown { ENV.delete("MAGNIFIC_API_KEY") }

  def task_body(status, generated = []) = { data: { task_id: "task-1", status:, generated: } }.to_json

  test "submits, waits, then stores the image as a new photo" do
    create = stub_request(:post, URL) { |request| JSON.parse(request.body)["reference_images"].first["image"].include?("/rails/active_storage/") }
      .to_return(status: 200, body: task_body("CREATED"))
    assert_enqueued_with(job: PhotoRenderingJob) { PhotoRenderingJob.perform_now(@rendering) }
    assert_requested create
    assert_equal [ "running", "task-1" ], [ @rendering.reload.status, @rendering.task_id ]

    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("COMPLETED", [ "https://cdn.test/out.jpg" ]))
    stub_request(:get, "https://cdn.test/out.jpg").to_return(status: 200, body: file_fixture("terrain_later.jpg").binread, headers: { "Content-Type" => "image/jpeg" })
    assert_difference -> { MapPhoto.count } do
      PhotoRenderingJob.perform_now(@rendering)
    end
    assert_equal "done", @rendering.reload.status
    assert_equal @photo, @rendering.result_photo.derived_from
  end

  test "follows the CDN's redirect and reads an image sent as octet-stream" do
    @rendering.update!(task_id: "task-1", status: "running", submitted_at: Time.current)
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("COMPLETED", [ "https://cdn.test/out" ]))
    stub_request(:get, "https://cdn.test/out").to_return(status: 302, headers: { "Location" => "https://files.test/abc" })
    stub_request(:get, "https://files.test/abc").to_return(status: 200, body: file_fixture("terrain_later.jpg").binread, headers: { "Content-Type" => "application/octet-stream" })
    assert_difference(-> { MapPhoto.count }) { PhotoRenderingJob.perform_now(@rendering) }
    assert_equal "image/jpeg", @rendering.reload.result_photo.image.content_type
  end

  test "a task still running is checked again, until the deadline" do
    @rendering.update!(task_id: "task-1", status: "running", submitted_at: Time.current)
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("IN_PROGRESS"))
    assert_enqueued_with(job: PhotoRenderingJob) { PhotoRenderingJob.perform_now(@rendering) }

    @rendering.update!(submitted_at: 10.minutes.ago)
    assert_no_enqueued_jobs(only: PhotoRenderingJob) { PhotoRenderingJob.perform_now(@rendering) }
    assert_equal [ "failed", "timeout" ], [ @rendering.reload.status, @rendering.error_code ]
  end

  test "a passing upstream error while waiting does not lose the image" do
    @rendering.update!(task_id: "task-1", status: "running", submitted_at: Time.current)
    stub_request(:get, "#{URL}/task-1").to_return(status: 503)
    assert_enqueued_with(job: PhotoRenderingJob) { PhotoRenderingJob.perform_now(@rendering) }
    assert_equal "running", @rendering.reload.status
  end

  test "failures are recorded with their reason" do
    stub_request(:post, URL).to_return(status: 402, body: "{}")
    PhotoRenderingJob.perform_now(@rendering)
    assert_equal [ "failed", "quota" ], [ @rendering.reload.status, @rendering.error_code ]
  end

  test "a failed task, an unreadable download and a missing key all fail cleanly" do
    @rendering.update!(task_id: "task-1", status: "running", submitted_at: Time.current)
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("FAILED"))
    PhotoRenderingJob.perform_now(@rendering)
    assert_equal "failed", @rendering.reload.error_code

    @rendering.update!(status: "running", error_code: nil)
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("COMPLETED", [ "https://cdn.test/out.jpg" ]))
    stub_request(:get, "https://cdn.test/out.jpg").to_return(status: 200, body: "<html>", headers: { "Content-Type" => "text/html" })
    assert_no_difference(-> { MapPhoto.count }) { PhotoRenderingJob.perform_now(@rendering) }
    assert_equal "download", @rendering.reload.error_code

    ENV.delete("MAGNIFIC_API_KEY")
    @rendering.update!(status: "queued", task_id: nil, error_code: nil)
    PhotoRenderingJob.perform_now(@rendering)
    assert_equal "not_configured", @rendering.reload.error_code
  end
end
