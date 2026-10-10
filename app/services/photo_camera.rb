# What a photo file says about the camera that took it, read once from the
# original (MapPhoto#camera). Every camera writes a few EXIF tags (make,
# model, focal length, exposure); a DJI drone adds an XMP block with its
# flight: height above the take-off point, altitude above sea level, and
# where the gimbal pointed (pitch: 0 = horizon, -90 = straight down; yaw:
# compass direction, which DJI writes from -180 to 180).
#
#   PhotoCamera.read(path) # => { "make" => "DJI", "model" => "FC7203", "drone" => true,
#                          #      "relative_altitude_m" => 45.2, "gimbal_pitch" => -30.1, ... }
#
# Only what is there is returned; a file libvips cannot read gives {}.
module PhotoCamera
  # Commercial names of the drone cameras DJI writes as the EXIF model.
  DJI_MODELS = {
    "FC7203" => "DJI Mavic Mini",
    "FC7303" => "DJI Mini 2",
    "FC3682" => "DJI Mini 3",
    "FC3582" => "DJI Mini 3 Pro",
    "FC8482" => "DJI Mini 4 Pro",
    "FC2103" => "DJI Mavic Air",
    "FC3170" => "DJI Mavic Air 2",
    "FC3411" => "DJI Air 2S",
    "FC8282" => "DJI Air 3",
    "FC220" => "DJI Mavic Pro",
    "L1D-20c" => "DJI Mavic 2 Pro",
    "FC2204" => "DJI Mavic 2 Zoom",
    "L2D-20c" => "DJI Mavic 3",
    "FC6310" => "DJI Phantom 4 Pro",
    "FC6310S" => "DJI Phantom 4 Pro V2",
    "FC6510" => "DJI Phantom 4 RTK",
    "FC330" => "DJI Phantom 4"
  }.freeze

  # XMP attribute (drone-dji namespace) => key in the result.
  DJI_XMP = {
    "RelativeAltitude" => "relative_altitude_m",
    "AbsoluteAltitude" => "absolute_altitude_m",
    "GimbalPitchDegree" => "gimbal_pitch",
    "GimbalYawDegree" => "gimbal_yaw",
    "GimbalRollDegree" => "gimbal_roll",
    "FlightYawDegree" => "flight_yaw",
    "FlightPitchDegree" => "flight_pitch",
    "FlightRollDegree" => "flight_roll"
  }.freeze

  # Below this gimbal pitch the photo looks at the ground, not at a view.
  NADIR_PITCH = -80

  module_function

  def read(path)
    image = Vips::Image.new_from_file(path.to_s, access: :sequential)
    fields = image.get_fields
    exif = ->(name) { exif_value(image, fields, name) }
    result = {
      "make" => exif.("exif-ifd0-Make"),
      "model" => exif.("exif-ifd0-Model"),
      "focal_length_35mm" => number(exif.("exif-ifd2-FocalLengthIn35mmFilm")),
      "f_number" => number(exif.("exif-ifd2-FNumber")),
      "exposure_time" => exif.("exif-ifd2-ExposureTime")&.sub(/\s*sec\.?\z/, ""),
      "iso" => number(exif.("exif-ifd2-ISOSpeedRatings") || exif.("exif-ifd2-PhotographicSensitivity"))&.round,
      "gps_altitude_m" => number(exif.("exif-ifd3-GPSAltitude"))
    }
    xmp = fields.include?("xmp-data") ? image.get("xmp-data").to_s.dup.force_encoding(Encoding::UTF_8).scrub : ""
    DJI_XMP.each { |attribute, key| result[key] = dji_value(xmp, attribute) }
    result["gimbal_yaw"] = compass(result["gimbal_yaw"])
    result["flight_yaw"] = compass(result["flight_yaw"])
    result["drone"] = true if result["make"].to_s.casecmp?("DJI") || result["relative_altitude_m"]
    result["model_name"] = DJI_MODELS[result["model"]] if result["drone"]
    result.compact
  rescue Vips::Error => error
    Rails.logger.warn("[photos] camera metadata unreadable: #{error.message}")
    {}
  end

  # The compass direction the photo looks at, when it looks at a view
  # rather than straight down at the ground.
  def heading(camera)
    yaw = camera["gimbal_yaw"]
    pitch = camera["gimbal_pitch"]
    return nil if yaw.nil? || (pitch && pitch <= NADIR_PITCH)
    yaw
  end

  # libvips gives "DJI (DJI, ASCII, 4 components, 4 bytes)": the value is
  # in the parentheses, before the type.
  def exif_value(image, fields, name)
    return nil unless fields.include?(name)
    raw = image.get(name).to_s
    value = raw[/\((.*), [A-Za-z ]+, \d+ components?, \d+ bytes?\)\z/, 1] || raw
    value.strip.presence
  end

  # Attribute form (drone-dji:GimbalYawDegree="-58.30") or element form
  # (<drone-dji:GimbalYawDegree>-58.30</drone-dji:GimbalYawDegree>).
  def dji_value(xmp, attribute)
    raw = xmp[/drone-dji:#{attribute}="([^"]*)"/, 1] || xmp[%r{<drone-dji:#{attribute}>([^<]*)</drone-dji:#{attribute}>}, 1]
    number(raw)
  end

  # "+45.20" -> 45.2, "f/2.8" -> 2.8, "24 mm" -> 24.0, "4/1" -> 4.0
  def number(raw)
    return nil if raw.blank?
    text = raw.to_s.strip
    if (fraction = text.match(%r{\A(-?\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)\z}))
      denominator = fraction[2].to_f
      return denominator.zero? ? nil : (fraction[1].to_f / denominator).round(2)
    end
    match = text[/[-+]?\d+(?:[.,]\d+)?/]
    match && match.tr(",", ".").to_f.round(2)
  end

  def compass(degrees)
    degrees && (degrees % 360).round(1)
  end
end
