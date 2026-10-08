# Height of the trees already standing on and around a map, from Meta and
# the World Resources Institute's global canopy height map, version 2
# (CHMv2, 2026: a DINOv3 model trained on airborne LiDAR, applied to Vantor,
# formerly Maxar, satellite imagery). CC BY 4.0, commercial use allowed,
# public S3 bucket, no account. Behind a small stable interface:
#
#   canopy = Providers::CanopyHeight.build
#   canopy.available?                               # false when CANOPY_HEIGHT_PROVIDER=none
#   canopy.window(west:, south:, east:, north:)     # => Window (heights in metres, one byte per cell)
#
# The data: one Cloud Optimized GeoTIFF per zoom-10 Web Mercator tile, named
# after its quadkey (`chm/1202023103.tif`), 32768 px square at ~1.19 m
# (zoom 17 pixels, EPSG:3857), uint8 metres (0 is both bare ground and no
# data), cut into 512 px internal tiles compressed with DEFLATE. Next to it,
# `metadata/<quadkey>.geojson` gives the acquisition date of the imagery,
# polygon by polygon. Version 1 (2024) uses another layout (zoom-9 BigTIFFs
# of 65536 one-row strips) and is not read here.
#
# Reading a map is a handful of HTTP range requests: the file header (64 kB,
# cached a month), then the internal tiles under the extent, contiguous ones
# merged into one request. The window is cached per extent: a new outline
# reads again, the same outline never does.
#
# Configured by ENV:
# - CANOPY_HEIGHT_PROVIDER: meta (default) | none
# - CANOPY_HEIGHT_URL: the dataset's base URL (defaults to Meta's bucket)
module Providers
  class CanopyHeight
    class Unavailable < StandardError; end
    class TooLarge < Unavailable; end

    DEFAULT_URL = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3".freeze
    ATTRIBUTION = "Meta and World Resources Institute (2026), CHMv2, CC BY 4.0; imagery © Vantor (Maxar)".freeze
    LICENCE = "CC BY 4.0".freeze
    INFO_URL = "https://registry.opendata.aws/dataforgood-fb-forestsv2/".freeze

    HALF_WORLD = Math::PI * Relief::Mercator::EARTH_RADIUS
    FILE_ZOOM = 10
    FILE_PIXELS = 32_768
    # Zoom 17 pixels: the size of one source pixel in EPSG:3857 metres.
    RESOLUTION = 2 * HALF_WORLD / (2**FILE_ZOOM * FILE_PIXELS)
    MAX_CELLS = 512
    # Above this (ground metres per side), a map is a landscape, not a garden.
    MAX_SPAN_M = 2_000
    HEADER_BYTES = 65_536
    # Merge two tile reads when the gap between them is smaller than this.
    MERGE_GAP = 16_384
    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 60
    CACHE_TTL = 30.days

    # heights and maxima: one byte per cell, row by row from the north-west
    # corner, in metres. A cell is `step` × `step` source pixels: heights is
    # their mean, maxima their maximum. mercator: [min_x, min_y, max_x, max_y]
    # in EPSG:3857 metres; bounds: the same in degrees. dates: [first, last]
    # acquisition dates of the imagery ("YYYY-MM-DD"), or nil when unknown.
    Window = Data.define(:width, :height, :step, :heights, :maxima, :mercator, :bounds, :dates, :covered) do
      def cell_size = step * RESOLUTION
    end

    def self.build(env = ENV)
      name = env.fetch("CANOPY_HEIGHT_PROVIDER", "meta").to_s.strip.downcase
      return new(nil) unless name == "meta"

      new(env["CANOPY_HEIGHT_URL"].presence || DEFAULT_URL)
    end

    def initialize(url, connection: nil)
      @url = url&.chomp("/")
      @connection = connection
    end

    def available? = !@url.nil?

    def attribution = ATTRIBUTION

    def window(west:, south:, east:, north:)
      raise Unavailable, "not configured" unless available?

      min_x, min_y = Relief::Mercator.forward(west.to_f, south.to_f)
      max_x, max_y = Relief::Mercator.forward(east.to_f, north.to_f)
      gx0, gy0 = pixel(min_x, max_y)
      gx1, gy1 = pixel(max_x, min_y)
      w, h = gx1 - gx0 + 1, gy1 - gy0 + 1
      ground = RESOLUTION / Math.cosh((min_y + max_y) / 2 / Relief::Mercator::EARTH_RADIUS)
      raise TooLarge, "extent too large" if [ w, h ].max * ground > MAX_SPAN_M

      step = [ w, h ].max.fdiv(MAX_CELLS).ceil
      w, h = w.fdiv(step).ceil * step, h.fdiv(step).ceil * step
      key = [ "canopy_height/v1", Digest::SHA1.hexdigest(@url)[0, 8], gx0, gy0, w, h, step ].join("/")
      Window.new(**Rails.cache.fetch(key, expires_in: CACHE_TTL) { read(gx0, gy0, w, h, step) })
    end

    def file_url(quadkey) = "#{@url}/chm/#{quadkey}.tif"
    def metadata_url(quadkey) = "#{@url}/metadata/#{quadkey}.geojson"

    # The zoom-10 quadkey of a file, from its tile column and row.
    def self.quadkey(x, y, zoom = FILE_ZOOM)
      (1..zoom).map do |i|
        mask = 1 << (zoom - i)
        (x & mask).zero? ? ((y & mask).zero? ? 0 : 2) : ((y & mask).zero? ? 1 : 3)
      end.join
    end

    private
      # Global zoom-17 pixel (column, row) of an EPSG:3857 point.
      def pixel(x, y)
        [ ((x + HALF_WORLD) / RESOLUTION).floor, ((HALF_WORLD - y) / RESOLUTION).floor ]
      end

      def read(gx0, gy0, w, h, step)
        native = native_window(gx0, gy0, w, h)
        heights, maxima = aggregate(native[:bytes], w, h, step)
        min_x, max_y = gx0 * RESOLUTION - HALF_WORLD, HALF_WORLD - gy0 * RESOLUTION
        max_x, min_y = min_x + w * RESOLUTION, max_y - h * RESOLUTION
        west, south = Relief::Mercator.inverse(min_x, min_y)
        east, north = Relief::Mercator.inverse(max_x, max_y)
        {
          width: w / step, height: h / step, step:, heights:, maxima:,
          mercator: [ min_x, min_y, max_x, max_y ],
          bounds: [ west, south, east, north ].map { _1.round(7) },
          dates: dates(native[:quadkeys], [ west, south, east, north ]),
          covered: native[:covered]
        }
      end

      # The source pixels of the window, one byte each, row by row. Files
      # that do not exist (no coverage) read as zero.
      def native_window(gx0, gy0, w, h)
        out = ("\0" * (w * h)).b
        quadkeys, covered = [], false
        files_under(gx0, gy0, w, h).each do |fx, fy|
          quadkey = self.class.quadkey(fx, fy)
          quadkeys << quadkey
          header = header_for(quadkey, fx, fy) or next
          covered = true
          # The window, in this file's pixels.
          lx0, ly0 = [ gx0 - fx * FILE_PIXELS, 0 ].max, [ gy0 - fy * FILE_PIXELS, 0 ].max
          lx1 = [ gx0 + w - 1 - fx * FILE_PIXELS, header[:width] - 1 ].min
          ly1 = [ gy0 + h - 1 - fy * FILE_PIXELS, header[:height] - 1 ].min
          tw, th = header[:tile_width], header[:tile_height]
          wanted = (ly0 / th..ly1 / th).flat_map { |ty| (lx0 / tw..lx1 / tw).map { |tx| [ tx, ty ] } }
          tiles = tiles(quadkey, header, wanted)
          wanted.each do |tx, ty|
            data = tiles[[ tx, ty ]] or next
            row_from, row_to = [ ty * th, ly0 ].max, [ ty * th + th - 1, ly1 ].min
            col_from, col_to = [ tx * tw, lx0 ].max, [ tx * tw + tw - 1, lx1 ].min
            length = col_to - col_from + 1
            (row_from..row_to).each do |ly|
              chunk = data.byteslice((ly - ty * th) * tw + (col_from - tx * tw), length)
              next unless chunk&.bytesize == length

              target = (ly + fy * FILE_PIXELS - gy0) * w + (col_from + fx * FILE_PIXELS - gx0)
              out.bytesplice(target, length, chunk)
            end
          end
        end
        { bytes: out, quadkeys:, covered: }
      end

      def files_under(gx0, gy0, w, h)
        xs = (gx0 / FILE_PIXELS..(gx0 + w - 1) / FILE_PIXELS)
        ys = (gy0 / FILE_PIXELS..(gy0 + h - 1) / FILE_PIXELS)
        ys.flat_map { |fy| xs.map { |fx| [ fx, fy ] } }
      end

      # Mean and maximum of each step × step block.
      def aggregate(bytes, w, h, step)
        return [ bytes, bytes ] if step == 1

        cols = w / step
        heights, maxima = "".b, "".b
        (0...h / step).each do |row|
          sums, tops = Array.new(cols, 0), Array.new(cols, 0)
          step.times do |dy|
            values = bytes.byteslice((row * step + dy) * w, w).unpack("C*")
            values.each_with_index do |value, x|
              col = x / step
              sums[col] += value
              tops[col] = value if value > tops[col]
            end
          end
          area = step * step
          heights << sums.map { (_1.to_f / area).round }.pack("C*")
          maxima << tops.pack("C*")
        end
        [ heights, maxima ]
      end

      # Decoded internal tiles ({ [tx, ty] => 512 × 512 bytes }); contiguous
      # tiles in the file are read with one request.
      def tiles(quadkey, header, wanted)
        across = header[:width].fdiv(header[:tile_width]).ceil
        entries = wanted.filter_map do |tx, ty|
          index = ty * across + tx
          offset, count = header[:offsets][index], header[:byte_counts][index]
          [ [ tx, ty ], offset, count ] if offset.to_i.positive? && count.to_i.positive?
        end
        groups = entries.sort_by { _1[1] }.slice_when { |a, b| b[1] - (a[1] + a[2]) > MERGE_GAP }
        groups.each_with_object({}) do |group, out|
          first, last = group.first[1], group.map { _1[1] + _1[2] }.max - 1
          bytes = range(file_url(quadkey), first, last) or raise Unavailable, "missing tiles in #{quadkey}"
          group.each do |tile, offset, count|
            out[tile] = decode(bytes.byteslice(offset - first, count), header)
          end
        end
      end

      def decode(compressed, header)
        raw = header[:compression] == 1 ? compressed : Zlib::Inflate.inflate(compressed)
        return raw unless header[:predictor] == 2

        width = header[:tile_width]
        bytes = raw.bytes
        bytes.each_index { |i| bytes[i] = (bytes[i] + bytes[i - 1]) & 0xFF unless (i % width).zero? }
        bytes.pack("C*")
      rescue Zlib::Error => e
        raise Unavailable, "corrupt tile: #{e.message}"
      end

      # The first image of a file (full resolution), or nil when the file
      # does not exist (no coverage there).
      def header_for(quadkey, fx, fy)
        @headers ||= {}
        return @headers[quadkey] if @headers.key?(quadkey)

        url = file_url(quadkey)
        cached = Rails.cache.fetch([ "canopy_height/header", url ].join("/"), expires_in: CACHE_TTL) do
          bytes = range(url, 0, HEADER_BYTES - 1)
          bytes ? GeoTiffHeader.parse(bytes, fetch: ->(first, last) { range(url, first, last) }) : false
        end
        check_grid!(cached, fx, fy) if cached
        @headers[quadkey] = cached || nil
      rescue GeoTiffHeader::Error => e
        raise Unavailable, e.message
      end

      # The reader places pixels on the global zoom-17 grid: a file that is
      # not exactly its quadkey's tile, in uint8, would be misread.
      def check_grid!(header, fx, fy)
        origin_x = fx * FILE_PIXELS * RESOLUTION - HALF_WORLD
        origin_y = HALF_WORLD - fy * FILE_PIXELS * RESOLUTION
        aligned = header[:width] == FILE_PIXELS && header[:height] == FILE_PIXELS &&
                  header[:bits] == 8 && header[:sample_format] == 1 &&
                  header[:scale].all? { (_1 - RESOLUTION).abs < 1e-6 } &&
                  (header[:origin][0] - origin_x).abs < RESOLUTION / 2 && (header[:origin][1] - origin_y).abs < RESOLUTION / 2
        raise Unavailable, "unexpected grid in #{file_url(self.class.quadkey(fx, fy))}" unless aligned
      end

      # [first, last] acquisition dates of the imagery under the bounds, read
      # from the per-file metadata (polygons with an `acq_date`). Best effort:
      # nil when the metadata is missing or unreadable.
      def dates(quadkeys, bounds)
        west, south, east, north = bounds
        found = quadkeys.flat_map do |quadkey|
          footprints(quadkey).filter_map do |date, (w, s, e, n)|
            date if w <= east && e >= west && s <= north && n >= south
          end
        end
        found.empty? ? nil : found.minmax
      end

      # [[date, [west, south, east, north]], ...] for one file, cached: the
      # metadata file is a few MB, the footprints a few bytes.
      def footprints(quadkey)
        Rails.cache.fetch([ "canopy_height/dates", metadata_url(quadkey) ].join("/"), expires_in: CACHE_TTL) do
          response = connection.get(metadata_url(quadkey))
          next [] if response.status == 404 || response.status == 403
          # Anything else is transient: not cached, read again next time.
          raise Faraday::ServerError, "HTTP #{response.status}" unless response.status == 200

          JSON.parse(response.body).fetch("features", []).filter_map do |feature|
            date = feature.dig("properties", "acq_date").to_s
            next unless date.match?(/\A\d{4}-\d{2}-\d{2}\z/)

            points = feature.dig("geometry", "coordinates").to_a.flatten.each_slice(2).to_a
            next if points.empty?

            lngs, lats = points.transpose
            [ date, [ lngs.min, lats.min, lngs.max, lats.max ].map { _1.round(6) } ]
          end
        end
      rescue Faraday::Error, JSON::ParserError, TypeError, NoMethodError => e
        Rails.logger.info("[canopy] no dates for #{quadkey}: #{e.class}")
        []
      end

      # Bytes first..last of a file; nil when the file does not exist.
      def range(url, first, last)
        response = connection.get(url) { |request| request.headers["Range"] = "bytes=#{first}-#{last}" }
        return nil if response.status == 404 || response.status == 403
        raise Unavailable, "HTTP #{response.status}" unless response.status.between?(200, 299)

        body = response.body.to_s.b
        # A server that ignores Range answers the whole file.
        response.status == 200 && body.bytesize > last - first + 1 ? body.byteslice(first, last - first + 1) : body
      rescue Faraday::Error => e
        raise Unavailable, "#{e.class}: #{e.message.to_s[0, 200]}"
      end

      def connection
        @connection ||= Faraday.new do |f|
          f.options.open_timeout = OPEN_TIMEOUT
          f.options.timeout = READ_TIMEOUT
          f.headers["User-Agent"] = GeoHttp::USER_AGENT
        end
      end
  end
end
