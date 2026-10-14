require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class PhotoCameraJobTest < ActiveJob::TestCase
  include SoilPhotosHelper

  test "a new photo is read once its upload is committed" do
    assert_enqueued_with(job: PhotoCameraJob) { create_photo(file: "drone_dji.jpg") }
  end

  test "records the camera and takes the drone's gimbal as the heading" do
    photo = create_photo(file: "drone_dji.jpg")
    PhotoCameraJob.perform_now(photo)
    photo.reload
    assert_equal "DJI Mavic Mini", photo.camera["model_name"]
    assert_in_delta 301.7, photo.heading
    assert_equal "DJI Mavic Mini", photo.as_inertia[:camera]["model_name"]
  end

  test "keeps a heading someone already gave" do
    photo = create_photo(file: "drone_dji.jpg", heading: 90)
    PhotoCameraJob.perform_now(photo)
    assert_equal 90, photo.reload.heading
  end

  test "a photo without camera tags is read once all the same" do
    photo = create_photo
    PhotoCameraJob.perform_now(photo)
    assert_equal({}, photo.reload.camera)
    assert_nil photo.as_inertia[:camera]
  end

  test "the backfill reads the photos never read, and only those" do
    unread = create_photo(file: "drone_dji.jpg")
    read = create_photo
    read.update_columns(camera: { "make" => "Apple" })
    PhotoCameraJob.backfill
    assert_equal "DJI", unread.reload.camera["make"]
    assert_equal({ "make" => "Apple" }, read.reload.camera)
  end

  test "a video is placed and dated from its own tags, without overriding what was given" do
    video = create_photo(file: "terrain.mp4", type: "video/mp4")
    PhotoCameraJob.perform_now(video)
    video.reload
    assert_in_delta 4.8867, video.lng, 1e-6
    assert_in_delta 50.3204, video.lat, 1e-6
    assert_equal "exif", video.location_source
    assert_equal Time.utc(2026, 5, 17, 14, 32, 10), video.taken_at
    assert_equal({}, video.camera)

    placed = create_photo(file: "terrain.mp4", type: "video/mp4", salt: "b", location: [ 4.9, 50.34 ], location_source: "map")
    PhotoCameraJob.perform_now(placed)
    assert_in_delta 4.9, placed.reload.lng, 1e-6
  end
end
