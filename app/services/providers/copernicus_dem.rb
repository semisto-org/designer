module Providers
  # Pan-European relief from the Copernicus DEM GLO-30 (30 m), read straight
  # from its Cloud Optimized GeoTIFFs on the AWS open data bucket: a few HTTP
  # range requests per map, no GDAL. It is a SURFACE model (trees and roofs
  # included) at 30 m: indicative only, the base used where a region has no
  # LiDAR of its own.
  #
  # Files are one degree square, named after their south-west corner
  # (Copernicus_DSM_COG_10_N50_00_E004_00_DEM). Inside, 1024 px tiles of
  # 32-bit floats, DEFLATE-compressed with the floating point predictor
  # (TIFF predictor 3): per row, bytes are differenced and stored as byte
  # planes, most significant first. A missing file is sea: no data.
  #
  # Configuration (region settings `relief`):
  #   datasets: { terrain: { url: <bucket URL>, label: } }, label, attribution.
  class CopernicusDem
    class Error < StandardError; end

    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 60
    HEADER_BYTES = 65_536
    NODATA_BELOW = -1_000.0
    TAGS = { 256 => :width, 257 => :height, 259 => :compression, 317 => :predictor, 322 => :tile_width,
             323 => :tile_height, 324 => :tile_offsets, 325 => :tile_byte_counts, 339 => :sample_format,
             33550 => :pixel_scale, 33922 => :tiepoint }.freeze
    TYPE_SIZES = { 1 => 1, 2 => 1, 3 => 2, 4 => 4, 5 => 8, 11 => 4, 12 => 8, 16 => 8 }.freeze

    Header = Data.define(:width, :height, :tile_width, :tile_height, :offsets, :byte_counts, :origin_lng, :origin_lat, :scale_lng, :scale_lat)

    attr_reader :config

    def initialize(config, connection: nil, sleeper: nil)
      @config = config.deep_stringify_keys
      @connection = connection
      @headers = {}
      @rows = {}
    end

    def key = "copernicus_dem"
    def label = config["label"].presence || dataset_label(:terrain)
    def attribution = config["attribution"]
    # The whole grid in one call: tiles and rows are cached per instance.
    def chunk_size = (config["chunk"] || 2_000_000).to_i
    def threads = 1

    def dataset?(name) = name.to_s == "terrain" && base_url.present?
    def dataset_label(name) = config.dig("datasets", name.to_s, "label")

    # One elevation per EPSG:3857 point, nil for sea or no data.
    def sample(name, points, _extent)
      raise Error, "dataset #{name} not available" unless dataset?(name)

      points.map do |x, y|
        lng, lat = Relief::Mercator.inverse(x, y)
        value_at(lng, lat)
      end
    end

    def file_url(lat_deg, lng_deg)
      ns = lat_deg.negative? ? "S" : "N"
      ew = lng_deg.negative? ? "W" : "E"
      name = format("Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM", ns, lat_deg.abs, ew, lng_deg.abs)
      "#{base_url}/#{name}/#{name}.tif"
    end

    private
      def base_url = config.dig("datasets", "terrain", "url").to_s.chomp("/")

      # Bilinear between the four nearest pixel centres (a 30 m grid sampled
      # at 1 m would otherwise come out as terraces); the nearest pixel at a
      # file edge or next to no data.
      def value_at(lng, lat)
        lat_deg, lng_deg = lat.floor, lng.floor
        header = header_for(lat_deg, lng_deg) or return nil
        fx = (lng - header.origin_lng) / header.scale_lng - 0.5
        fy = (header.origin_lat - lat) / header.scale_lat - 0.5
        col, row = fx.floor, fy.floor
        corners = [ [ col, row ], [ col + 1, row ], [ col, row + 1 ], [ col + 1, row + 1 ] ]
        values = corners.map { |c, r| pixel(lat_deg, lng_deg, header, c, r) }
        if values.all?
          tx, ty = fx - col, fy - row
          top = values[0] * (1 - tx) + values[1] * tx
          bottom = values[2] * (1 - tx) + values[3] * tx
          (top * (1 - ty) + bottom * ty).round(2)
        else
          pixel(lat_deg, lng_deg, header, (fx + 0.5).floor, (fy + 0.5).floor)&.round(2)
        end
      end

      def pixel(lat_deg, lng_deg, header, col, row)
        return nil unless col.between?(0, header.width - 1) && row.between?(0, header.height - 1)

        values = tile_row(lat_deg, lng_deg, header, col / header.tile_width, row / header.tile_height, row % header.tile_height)
        value = values[col % header.tile_width]
        value && value > NODATA_BELOW ? value : nil
      end

      # The header of one file, or nil when the file does not exist (sea).
      def header_for(lat_deg, lng_deg)
        key = [ lat_deg, lng_deg ]
        return @headers[key] if @headers.key?(key)

        url = file_url(lat_deg, lng_deg)
        bytes = Rails.cache.fetch([ "relief/copernicus/header", url ].join("/"), expires_in: 30.days) { range(url, 0, HEADER_BYTES - 1) || false }
        @headers[key] = bytes ? parse_header(bytes) : nil
      end

      # The decoded floats of one row of one internal tile.
      def tile_row(lat_deg, lng_deg, header, tile_col, tile_row_index, row_in_tile)
        index = tile_row_index * header.width.fdiv(header.tile_width).ceil + tile_col
        key = [ lat_deg, lng_deg, index, row_in_tile ]
        @rows[key] ||= begin
          raw = tile_bytes(lat_deg, lng_deg, header, index)
          raw ? decode_row(raw, header.tile_width, row_in_tile) : []
        end
      end

      def tile_bytes(lat_deg, lng_deg, header, index)
        @tiles ||= {}
        key = [ lat_deg, lng_deg, index ]
        return @tiles[key] if @tiles.key?(key)

        offset, count = header.offsets[index], header.byte_counts[index]
        return @tiles[key] = nil if offset.nil? || count.to_i.zero?

        compressed = range(file_url(lat_deg, lng_deg), offset, offset + count - 1) or raise Error, "missing tile #{index}"
        @tiles[key] = Zlib::Inflate.inflate(compressed)
      rescue Zlib::Error => e
        raise Error, "corrupt tile: #{e.message}"
      end

      # Undo the floating point predictor on one row, then read big-endian
      # floats from the byte planes.
      def decode_row(raw, tile_width, row)
        row_bytes = tile_width * 4
        bytes = raw.byteslice(row * row_bytes, row_bytes)&.bytes
        return [] unless bytes && bytes.size == row_bytes

        (1...row_bytes).each { |i| bytes[i] = (bytes[i] + bytes[i - 1]) & 0xFF }
        Array.new(tile_width) do |i|
          [ bytes[i], bytes[tile_width + i], bytes[2 * tile_width + i], bytes[3 * tile_width + i] ].pack("C4").unpack1("g")
        end
      end

      def parse_header(bytes)
        order = bytes.byteslice(0, 2) == "II" ? :little : :big
        short, long, double = order == :little ? %w[v V E] : %w[n N G]
        raise Error, "not a TIFF" unless bytes.byteslice(2, 2).unpack1(short) == 42

        ifd = bytes.byteslice(4, 4).unpack1(long)
        count = bytes.byteslice(ifd, 2).unpack1(short)
        tags = {}
        count.times do |n|
          entry = bytes.byteslice(ifd + 2 + n * 12, 12)
          tag, type = entry.unpack("#{short}#{short}")
          name = TAGS[tag] or next
          values = entry.byteslice(4, 4).unpack1(long)
          size = TYPE_SIZES.fetch(type, 1) * values
          data = size <= 4 ? entry.byteslice(8, 4) : bytes.byteslice(entry.byteslice(8, 4).unpack1(long), size)
          raise Error, "header too large" if data.nil? || data.bytesize < size

          format = { 3 => short, 4 => long, 12 => double }[type] or next
          tags[name] = data.unpack("#{format}#{values}")
        end
        raise Error, "unsupported compression" unless tags[:compression]&.first == 8 && tags[:sample_format]&.first == 3
        raise Error, "unsupported predictor" unless tags[:predictor].nil? || tags[:predictor].first == 3

        Header.new(
          width: tags[:width].first, height: tags[:height].first,
          tile_width: tags[:tile_width].first, tile_height: tags[:tile_height].first,
          offsets: tags[:tile_offsets], byte_counts: tags[:tile_byte_counts],
          origin_lng: tags[:tiepoint][3], origin_lat: tags[:tiepoint][4],
          scale_lng: tags[:pixel_scale][0], scale_lat: tags[:pixel_scale][1]
        )
      rescue NoMethodError, TypeError => e
        raise Error, "unreadable header: #{e.message}"
      end

      # Bytes first..last of a file; nil when the file does not exist.
      def range(url, first, last)
        response = connection.get(url) { |request| request.headers["Range"] = "bytes=#{first}-#{last}" }
        return nil if response.status == 404 || response.status == 403
        raise Error, "HTTP #{response.status}" unless response.status.between?(200, 299)

        response.body.to_s.b
      rescue Faraday::Error => e
        raise Error, "#{e.class}: #{e.message.to_s[0, 200]}"
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
