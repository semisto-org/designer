require "test_helper"

class HeicImageTest < ActiveSupport::TestCase
  test "converts a HEIC photo to a JPEG that keeps its position and date" do
    jpeg = HeicImage.to_jpeg(file_fixture("terrain_gps.heic").binread)
    assert_equal "image/jpeg", Marcel::MimeType.for(StringIO.new(jpeg))
    image = Vips::Image.new_from_buffer(jpeg, "")
    assert_equal [ 160, 120 ], [ image.width, image.height ]
    assert_match "50", image.get("exif-ifd3-GPSLatitude")
    assert_match "2026:05:17 14:32:10", image.get("exif-ifd2-DateTimeOriginal")
    assert_equal 1, image.get("orientation")
  end

  test "bytes that are not an image raise HeicImage::Error" do
    assert_raises(HeicImage::Error) { HeicImage.to_jpeg("not an image") }
  end

  test "knows the HEIC types and names the JPEG after the photo" do
    assert HeicImage.heic?("image/heic")
    assert HeicImage.heic?("image/heif")
    assert_not HeicImage.heic?("image/jpeg")
    assert_equal "IMG_0042.jpg", HeicImage.jpeg_filename("IMG_0042.HEIC")
    assert_equal "photo.jpg", HeicImage.jpeg_filename(".heic")
  end
end
