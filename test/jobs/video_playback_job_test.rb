require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class VideoPlaybackJobTest < ActiveJob::TestCase
  include SoilPhotosHelper

  test "a new video is checked once its upload is committed, a photo is not" do
    assert_enqueued_with(job: VideoPlaybackJob) { create_photo(file: "terrain.mp4", type: "video/mp4") }
    assert_no_enqueued_jobs(only: VideoPlaybackJob) { create_photo }
  end

  test "an H.264 MP4 is played from its own file" do
    video = create_photo(file: "terrain.mp4", type: "video/mp4")
    VideoPlaybackJob.perform_now(video)
    video.reload
    assert_equal "native", video.playback
    assert_not video.playable.attached?
    assert_equal video.image.blob, video.player_blob
  end

  test "a drone's HEVC video gets an H.264 copy every browser plays, outside the storage allowance" do
    video = create_photo(file: "terrain_hevc.mp4", type: "video/mp4")
    original = video.image.blob
    VideoPlaybackJob.perform_now(video)
    video.reload
    assert_equal "converted", video.playback
    assert video.playable.attached?
    assert_equal "video/mp4", video.playable.blob.content_type
    assert_equal "terrain_hevc.mp4", video.playable.blob.filename.to_s
    assert_equal original, video.image.blob, "the original stays as it was sent"
    assert_equal video.playable.blob, video.player_blob
  end

  test "a WebM video is converted to MP4" do
    video = create_photo(file: "terrain.webm", type: "video/webm")
    VideoPlaybackJob.perform_now(video)
    video.reload
    assert_equal "converted", video.playback
    assert_equal "terrain.mp4", video.playable.blob.filename.to_s
  end

  test "a file ffmpeg cannot read is recorded, so the backfill moves past it" do
    video = create_photo(file: "terrain.mp4", type: "video/mp4")
    video.image.blob.update_columns(checksum: Digest::MD5.base64digest("something else"))
    VideoPlaybackJob.perform_now(video)
    assert_equal "failed", video.reload.playback
    assert_equal video.image.blob, video.player_blob
  end

  test "the backfill checks the videos never checked, one at a time, and only those" do
    first = create_photo(file: "terrain.mp4", type: "video/mp4")
    second = create_photo(file: "terrain.mov", type: "video/quicktime")
    done = create_photo(file: "terrain.mp4", type: "video/mp4", salt: "b")
    done.update_columns(playback: "native")
    photo = create_photo
    VideoPlaybackJob.backfill
    assert_equal "native", first.reload.playback
    assert_nil second.reload.playback
    VideoPlaybackJob.backfill
    assert_equal "converted", second.reload.playback
    assert_nil photo.reload.playback
  end
end
