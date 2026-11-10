require "test_helper"

class VideoPlaybackTest < ActiveSupport::TestCase
  test "an H.264 MP4 plays as it is" do
    assert_equal :native, VideoPlayback.plan(file_fixture("terrain.mp4"), "video/mp4")
  end

  test "an H.264 QuickTime file only changes container" do
    assert_equal :remux, VideoPlayback.plan(file_fixture("terrain.mov"), "video/quicktime")
  end

  test "HEVC (drones, iPhones) and VP9 WebM are converted" do
    assert_equal :transcode, VideoPlayback.plan(file_fixture("terrain_hevc.mp4"), "video/mp4")
    assert_equal :transcode, VideoPlayback.plan(file_fixture("terrain.webm"), "video/webm")
  end

  test "a file ffprobe cannot read has no plan" do
    assert_nil VideoPlayback.plan(file_fixture("terrain.geojson"), "video/mp4")
  end

  test "a converted video is an H.264 MP4 with AAC sound and no tags" do
    Dir.mktmpdir do |dir|
      output = File.join(dir, "out.mp4")
      assert VideoPlayback.convert(file_fixture("terrain_hevc.mp4"), output, :transcode)
      streams = VideoPlayback.probe(output)
      assert_equal "h264", streams[:video]
      assert_equal "yuv420p", streams[:pix_fmt]
      assert_equal "aac", streams[:audio]
      assert_equal :native, VideoPlayback.plan(output, "video/mp4")
    end
  end

  test "a remuxed QuickTime file is an MP4 without its GPS tags" do
    Dir.mktmpdir do |dir|
      output = File.join(dir, "out.mp4")
      assert VideoPlayback.convert(file_fixture("terrain.mov"), output, :remux)
      assert_equal :native, VideoPlayback.plan(output, "video/mp4")
      assert_equal({}, VideoMetadata.read(output))
    end
  end
end
