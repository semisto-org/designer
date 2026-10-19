# Reads one tile out of a PMTiles v3 archive, for clients that cannot read
# the archive themselves with range requests (the phone app: its map engine
# sends our token only to our own API, and a signed file link expires within
# minutes). The archive stays where it is stored; only the byte ranges a tile
# needs are fetched, through the block given to `new` (offset, length →
# bytes). The header and directories are small and never change for one
# archive, so they are cached under `cache_key`.
# https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
module AerialViews
  class PmtilesReader
    # The header and, in every archive the spec's writers make, the root directory.
    FIRST_BYTES = 16_384
    MAX_DEPTH = 4
    COMPRESSIONS = { 1 => :none, 2 => :gzip }.freeze
    CONTENT_TYPES = { "png" => "image/png", "jpeg" => "image/jpeg", "webp" => "image/webp", "avif" => "image/avif" }.freeze

    class Unreadable < StandardError; end

    Entry = Struct.new(:tile_id, :offset, :length, :run_length)

    def initialize(cache_key:, &fetch)
      @cache_key = cache_key
      @fetch = fetch
    end

    # [bytes, content type] of the tile at z/x/y, or nil when the archive has none there.
    def tile(z, x, y)
      return nil if z.negative? || z > 31 || x.negative? || y.negative? || x >= (1 << z) || y >= (1 << z)
      head = header
      return nil if z < head[:min_zoom] || z > head[:max_zoom]
      entry = find(self.class.tile_id(z, x, y))
      return nil unless entry
      bytes = decompress(@fetch.call(head[:tile_data_offset] + entry.offset, entry.length), head[:tile_compression])
      [ bytes, CONTENT_TYPES.fetch(head[:tile_type], "application/octet-stream") ]
    end

    def header
      @header ||= cached("header") { parse_header(first_bytes) }
    end

    # The tile's place on the Hilbert curve of its zoom, after every tile of the zooms above.
    def self.tile_id(z, x, y)
      n = 1 << z
      d = 0
      s = n >> 1
      while s.positive?
        rx = (x & s).positive? ? 1 : 0
        ry = (y & s).positive? ? 1 : 0
        d += s * s * ((3 * rx) ^ ry)
        if ry.zero?
          if rx == 1
            x = n - 1 - x
            y = n - 1 - y
          end
          x, y = y, x
        end
        s >>= 1
      end
      ((n * n) - 1) / 3 + d
    end

    private
      def find(tile_id)
        offset = header[:root_offset]
        length = header[:root_length]
        MAX_DEPTH.times do
          entries = directory(offset, length)
          entry = search(entries, tile_id)
          return nil unless entry
          return entry if entry.run_length.positive?
          # A run length of 0 points to a leaf directory.
          offset = header[:leaf_offset] + entry.offset
          length = entry.length
        end
        nil
      end

      # The last entry at or before the tile, if its run covers it (or it is a leaf).
      def search(entries, tile_id)
        low = 0
        high = entries.length - 1
        while low <= high
          mid = (low + high) / 2
          diff = tile_id - entries[mid].tile_id
          return entries[mid] if diff.zero?
          diff.positive? ? low = mid + 1 : high = mid - 1
        end
        return nil if high.negative?
        entry = entries[high]
        return entry if entry.run_length.zero?
        entry if tile_id - entry.tile_id < entry.run_length
      end

      def directory(offset, length)
        cached("dir-#{offset}-#{length}") do
          bytes = offset + length <= first_bytes.bytesize ? first_bytes.byteslice(offset, length) : @fetch.call(offset, length)
          parse_directory(decompress(bytes, header[:internal_compression]))
        end
      end

      def first_bytes
        @first_bytes ||= @fetch.call(0, FIRST_BYTES).to_s.b
      end

      def parse_header(bytes)
        raise Unreadable, "not a PMTiles v3 archive" unless bytes.bytesize >= PmtilesHeader::LENGTH && bytes.start_with?(PmtilesHeader::MAGIC) && bytes.getbyte(7) == 3
        root_offset, root_length, _, _, leaf_offset, _, tile_data_offset = bytes.byteslice(8, 56).unpack("Q<7")
        {
          root_offset:, root_length:, leaf_offset:, tile_data_offset:,
          internal_compression: bytes.getbyte(97), tile_compression: bytes.getbyte(98),
          tile_type: PmtilesHeader::TILE_TYPES.fetch(bytes.getbyte(99), "unknown"),
          min_zoom: bytes.getbyte(100), max_zoom: bytes.getbyte(101)
        }
      end

      def decompress(bytes, compression)
        case COMPRESSIONS[compression]
        when :none then bytes
        when :gzip then Zlib::GzipReader.new(StringIO.new(bytes)).read
        else raise Unreadable, "compression #{compression} not supported"
        end
      end

      # Varints: the count, then tile id deltas, run lengths, lengths, and
      # offsets (0 = right after the previous entry).
      def parse_directory(bytes)
        io = StringIO.new(bytes.b)
        count = varint(io)
        entries = Array.new(count) { Entry.new(0, 0, 0, 0) }
        last_id = 0
        entries.each { |e| last_id += varint(io); e.tile_id = last_id }
        entries.each { |e| e.run_length = varint(io) }
        entries.each { |e| e.length = varint(io) }
        entries.each_with_index do |e, i|
          value = varint(io)
          e.offset = value.zero? && i.positive? ? entries[i - 1].offset + entries[i - 1].length : value - 1
        end
        entries
      end

      def varint(io)
        result = 0
        shift = 0
        loop do
          byte = io.getbyte
          raise Unreadable, "truncated directory" unless byte
          result |= (byte & 0x7f) << shift
          return result if byte < 0x80
          shift += 7
        end
      end

      def cached(part, &block)
        Rails.cache.fetch("pmtiles/#{@cache_key}/#{part}", expires_in: 1.day, &block)
      end
  end
end
