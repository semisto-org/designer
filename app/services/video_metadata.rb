# Where and when a video was shot, as its file says (ffprobe). Phones write
# both: the iPhone in QuickTime tags (`com.apple.quicktime.location.ISO6709`,
# `com.apple.quicktime.creationdate`, with its time zone), Android in
# `location` and `creation_time` (UTC).
#
#   VideoMetadata.read(path) # => { lng: 4.9073, lat: 50.3419, taken_at: Fri, 18 Apr 2025 17:19:23 CEST +02:00 }
#
# Only what is there is returned; without ffprobe, or for a file it cannot
# read, {}.
module VideoMetadata
  LOCATION_TAGS = %w[com.apple.quicktime.location.iso6709 location location-eng].freeze
  DATE_TAGS = %w[com.apple.quicktime.creationdate creation_time].freeze
  # ISO 6709: "+50.3419+004.9073+120.000/" (latitude, longitude, altitude).
  ISO6709 = /\A([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/
  TIMEOUT = 30

  module_function

  def read(path)
    output = IO.popen([ "timeout", TIMEOUT.to_s, "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path.to_s ], err: File::NULL, &:read)
    return {} unless $?.success?
    parse(JSON.parse(output).dig("format", "tags") || {})
  rescue Errno::ENOENT, JSON::ParserError
    {}
  end

  def parse(tags)
    tags = tags.to_h.transform_keys { |key| key.to_s.downcase }
    result = {}
    location = tags.values_at(*LOCATION_TAGS).compact.first
    if location && (match = location.to_s.strip.match(ISO6709))
      lat = match[1].to_f
      lng = match[2].to_f
      result.merge!(lng:, lat:) if lat.between?(-90, 90) && lng.between?(-180, 180) && !(lat.zero? && lng.zero?)
    end
    date = tags.values_at(*DATE_TAGS).compact.first
    taken_at = parse_time(date)
    result[:taken_at] = taken_at if taken_at
    result
  end

  def parse_time(value)
    return nil if value.blank?
    time = Time.zone.parse(value.to_s)
    # Cameras without a clock write 1904-01-01 (QuickTime's epoch) or 1970.
    time if time && time.year >= 1990
  rescue ArgumentError
    nil
  end
end
