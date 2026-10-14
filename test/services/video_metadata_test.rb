require "test_helper"

class VideoMetadataTest < ActiveSupport::TestCase
  test "reads the position and date an Android phone writes" do
    data = VideoMetadata.read(file_fixture("terrain.mp4"))
    assert_in_delta 4.8867, data[:lng], 1e-6
    assert_in_delta 50.3204, data[:lat], 1e-6
    assert_equal Time.utc(2026, 5, 17, 14, 32, 10), data[:taken_at]
  end

  test "prefers the iPhone's QuickTime tags, with their time zone" do
    data = VideoMetadata.parse(
      "com.apple.quicktime.location.ISO6709" => "+50.3419+004.9073+120.000/",
      "com.apple.quicktime.creationdate" => "2025-04-18T17:19:23+0200",
      "creation_time" => "2025-04-18T15:19:24.000000Z"
    )
    assert_equal [ 4.9073, 50.3419 ], [ data[:lng], data[:lat] ]
    assert_equal Time.utc(2025, 4, 18, 15, 19, 23), data[:taken_at]
  end

  test "ignores a null island, a camera without clock and a file it cannot read" do
    assert_equal({}, VideoMetadata.parse("location" => "+00.0000+000.0000/", "creation_time" => "1904-01-01T00:00:00Z"))
    assert_equal({}, VideoMetadata.read(file_fixture("notes.txt")))
  end
end
