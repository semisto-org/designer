# HEIC/HEIF is the iPhone's photo format. Only Safari shows it, so photos in
# that format are converted to JPEG when they are uploaded (HeicAttachment).
#
# libvips reads HEIC through libheif (libheif1 in the production image; the
# HEVC decoder plugin, libheif-plugin-libde265, on Ubuntu 24.04 and later).
# The JPEG keeps the photo's metadata: EXIF (GPS position, date, camera
# direction), ICC colour profile and XMP.
module HeicImage
  TYPES = %w[image/heic image/heif image/heic-sequence image/heif-sequence].freeze
  EXTENSIONS = /\.(heic|heif)\z/i
  QUALITY = 90

  class Error < StandardError; end

  module_function

  def heic?(content_type) = TYPES.include?(content_type.to_s)

  # "IMG_0042.HEIC" -> "IMG_0042.jpg"
  def jpeg_filename(filename)
    base = File.basename(filename.to_s).sub(EXTENSIONS, "").presence || "photo"
    "#{base}.jpg"
  end

  # The JPEG bytes of a HEIC file. libheif has already applied the rotation
  # stored in the file, so the EXIF orientation is reset to « upright ».
  def to_jpeg(bytes)
    image = Vips::Image.new_from_buffer(bytes, "")
    image = image.colourspace(:srgb) if image.interpretation == :rgb16
    image = image.mutate { |copy| copy.set_type!(GObject::GINT_TYPE, "orientation", 1) }
    image.jpegsave_buffer(Q: QUALITY)
  rescue Vips::Error => error
    raise Error, error.message
  end
end
