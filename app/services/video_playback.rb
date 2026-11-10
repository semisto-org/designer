# Makes a video playable in every browser. Phones and drones record HEVC
# (H.265), which Chrome and Firefox often cannot play, and Safari refuses
# some of it too (SEMISTO-DESIGNER-16); a WebM is VP8/VP9, which older Safari
# cannot play. What every browser plays is H.264 (8-bit 4:2:0) in an MP4,
# with AAC or MP3 sound, or none.
#
#   VideoPlayback.plan(path, "video/mp4")         # => :native, :remux, :transcode or nil
#   VideoPlayback.convert(path, output, :remux)   # => true when output is written
#
# :native plays as it is; :remux only moves the streams from a QuickTime file
# into an MP4; :transcode re-encodes. A copy carries none of the original's
# tags (place, date, device): those stay with the original, for editors.
module VideoPlayback
  PLAYABLE_VIDEO = %w[h264].freeze
  PLAYABLE_PIXELS = %w[yuv420p yuvj420p].freeze
  PLAYABLE_AUDIO = [ nil, "aac", "mp3" ].freeze
  PROBE_TIMEOUT = 30
  # A 1 GB 4K video takes a while to encode on the server.
  CONVERT_TIMEOUT = 2.hours.to_i
  # Longest side of a converted video: full HD is plenty for a terrain video.
  MAX_SIDE = 1920

  module_function

  # { container:, video:, pix_fmt:, audio: } of the first video and audio
  # streams, or nil for a file ffprobe cannot read.
  def probe(path)
    output = IO.popen([ "timeout", PROBE_TIMEOUT.to_s, "ffprobe", "-v", "quiet", "-print_format", "json",
                        "-show_format", "-show_streams", path.to_s ], err: File::NULL, &:read)
    return nil unless $?.success?
    data = JSON.parse(output)
    streams = data["streams"] || []
    video = streams.find { |stream| stream["codec_type"] == "video" && stream.dig("disposition", "attached_pic") != 1 }
    return nil unless video
    audio = streams.find { |stream| stream["codec_type"] == "audio" }
    { container: data.dig("format", "format_name").to_s, brand: data.dig("format", "tags", "major_brand").to_s.strip,
      video: video["codec_name"], pix_fmt: video["pix_fmt"], audio: audio&.dig("codec_name") }
  rescue Errno::ENOENT, JSON::ParserError
    nil
  end

  def plan(path, content_type)
    streams = probe(path)
    return nil unless streams
    playable = PLAYABLE_VIDEO.include?(streams[:video]) && PLAYABLE_PIXELS.include?(streams[:pix_fmt]) &&
      PLAYABLE_AUDIO.include?(streams[:audio])
    return :transcode unless playable && streams[:container].include?("mp4")
    content_type == "video/mp4" && streams[:brand] != "qt" ? :native : :remux
  end

  def convert(input, output, plan)
    codecs = plan == :remux ? %w[-c copy] : [
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-vf", "scale=w='min(#{MAX_SIDE},iw)':h='min(#{MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-threads", "2"
    ]
    command = [ "timeout", CONVERT_TIMEOUT.to_s, "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", input.to_s,
                "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
                *codecs, "-movflags", "+faststart", "-f", "mp4", output.to_s ]
    system(*command, out: File::NULL, err: File::NULL) && File.size?(output.to_s).present?
  rescue Errno::ENOENT
    false
  end
end
