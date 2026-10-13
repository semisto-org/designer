# Where and when a photo was taken, read on the server from the file's EXIF
# block: what the browser reads before an upload from the editor, for photos
# that arrive another way (the MCP server's attach_photos, import_from_url).
#
#   PhotoExif.read(path) # => { taken_at: Time, location: [lng, lat], heading: 135.0 }
#
# Only what the file says is returned; a file libvips cannot read gives {}.
# A date without its offset (OffsetTimeOriginal) is read in the app's time zone.
module PhotoExif
  module_function

  def read(path)
    image = Vips::Image.new_from_file(path.to_s, access: :sequential)
    fields = image.get_fields
    value = ->(name) { PhotoCamera.exif_value(image, fields, name) }
    {
      taken_at: taken_at(value.("exif-ifd2-DateTimeOriginal") || value.("exif-ifd0-DateTime"), value.("exif-ifd2-OffsetTimeOriginal")),
      location: location(value),
      heading: heading(value.("exif-ifd3-GPSImgDirection"))
    }.compact
  rescue Vips::Error => error
    Rails.logger.warn("[photos] EXIF unreadable: #{error.message}")
    {}
  end

  # "2026:05:17 14:32:10" (+ "+02:00")
  def taken_at(raw, offset)
    match = raw.to_s.match(/\A(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/) or return nil
    parts = match.captures.map(&:to_i)
    return nil if parts.first < 1900
    if offset.to_s.match?(/\A[+-]\d{2}:\d{2}\z/)
      Time.new(*parts, offset)
    else
      Time.zone.local(*parts)
    end
  rescue ArgumentError
    nil
  end

  # Degrees, minutes, seconds ("50, 20, 27.6") and their N/S, E/W.
  def location(value)
    lat = degrees(value.("exif-ifd3-GPSLatitude"), value.("exif-ifd3-GPSLatitudeRef"), "S")
    lng = degrees(value.("exif-ifd3-GPSLongitude"), value.("exif-ifd3-GPSLongitudeRef"), "W")
    return nil unless lat && lng && lat.between?(-90, 90) && lng.between?(-180, 180)
    return nil if lat.zero? && lng.zero? # a camera without a fix writes 0, 0
    [ lng.round(7), lat.round(7) ]
  end

  def degrees(raw, ref, negative)
    # Not PhotoCamera.number: it rounds to 2 decimals, and some cameras write
    # decimal degrees (50.3402, 0, 0).
    numbers = raw.to_s.split(",").map { |part| Float(part.strip, exception: false) }
    return nil if numbers.empty? || numbers.any?(&:nil?)
    d, m, s = numbers + [ 0, 0 ]
    total = d + m / 60.0 + s / 3600.0
    ref.to_s.strip.upcase == negative ? -total : total
  end

  def heading(raw)
    degrees = PhotoCamera.number(raw)
    degrees && (degrees % 360).round(1)
  end
end
