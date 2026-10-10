module Providers
  # The first image file directory of a tiled GeoTIFF (classic or BigTIFF),
  # read without GDAL: size, internal tiles and where they sit in the file,
  # compression, predictor, sample format and the georeferencing (pixel
  # scale and tie point). Values stored outside the first bytes (the tile
  # offsets of a large file) are fetched on demand through `fetch`.
  #
  #   GeoTiffHeader.parse(first_64k, fetch: ->(first, last) { bytes })
  #   # => { width:, height:, tile_width:, tile_height:, offsets:, byte_counts:,
  #   #      compression:, predictor:, bits:, sample_format:, origin: [x, y], scale: [sx, sy] }
  #
  # Only what a range reader of single-band rasters needs. The Copernicus DEM
  # reader keeps its own (float, classic TIFF only) parser.
  module GeoTiffHeader
    class Error < StandardError; end

    TAGS = { 256 => :width, 257 => :height, 258 => :bits, 259 => :compression, 317 => :predictor,
             322 => :tile_width, 323 => :tile_height, 324 => :tile_offsets, 325 => :tile_byte_counts,
             339 => :sample_format, 33550 => :pixel_scale, 33922 => :tiepoint }.freeze
    TYPE_SIZES = { 1 => 1, 2 => 1, 3 => 2, 4 => 4, 5 => 8, 7 => 1, 11 => 4, 12 => 8, 16 => 8, 17 => 8 }.freeze
    # Above this, a directory is not one we know how to read.
    MAX_VALUES = 4_000_000

    module_function

    def parse(bytes, fetch: nil)
      order = bytes.byteslice(0, 2)
      raise Error, "not a TIFF" unless order == "II" || order == "MM"

      little = order == "II"
      short, long, quad = little ? %w[v V Q<] : %w[n N Q>]
      double = little ? "E" : "G"
      version = bytes.byteslice(2, 2).unpack1(short)
      big = version == 43
      raise Error, "not a TIFF" unless big || version == 42

      ifd = big ? bytes.byteslice(8, 8).unpack1(quad) : bytes.byteslice(4, 4).unpack1(long)
      entry_size, count_size = big ? [ 20, 8 ] : [ 12, 2 ]
      directory = slice(bytes, ifd, count_size, fetch)
      count = big ? directory.unpack1(quad) : directory.unpack1(short)
      entries = slice(bytes, ifd + count_size, count * entry_size, fetch)
      formats = { 3 => short, 4 => long, 16 => quad, 12 => double }

      tags = {}
      count.times do |n|
        entry = entries.byteslice(n * entry_size, entry_size)
        tag, type = entry.unpack("#{short}#{short}")
        name = TAGS[tag] or next
        format = formats[type] or next
        values = big ? entry.byteslice(4, 8).unpack1(quad) : entry.byteslice(4, 4).unpack1(long)
        raise Error, "directory too large" if values > MAX_VALUES

        size = TYPE_SIZES.fetch(type) * values
        inline = big ? 8 : 4
        data = if size <= inline
          entry.byteslice(big ? 12 : 8, size)
        else
          offset = big ? entry.byteslice(12, 8).unpack1(quad) : entry.byteslice(8, 4).unpack1(long)
          slice(bytes, offset, size, fetch)
        end
        tags[name] = data.unpack("#{format}#{values}")
      end

      raise Error, "not a tiled TIFF" unless tags[:tile_width] && tags[:tile_offsets] && tags[:tile_byte_counts]
      raise Error, "unsupported compression" unless [ 1, 8, 32946 ].include?(tags[:compression]&.first || 1)
      raise Error, "unsupported predictor" unless [ 1, 2 ].include?(tags[:predictor]&.first || 1)
      raise Error, "not georeferenced" unless tags[:pixel_scale] && tags[:tiepoint]

      {
        width: tags[:width].first, height: tags[:height].first,
        tile_width: tags[:tile_width].first, tile_height: tags[:tile_height].first,
        offsets: tags[:tile_offsets], byte_counts: tags[:tile_byte_counts],
        compression: tags[:compression]&.first || 1, predictor: tags[:predictor]&.first || 1,
        bits: tags[:bits]&.first || 8, sample_format: tags[:sample_format]&.first || 1,
        origin: [ tags[:tiepoint][3], tags[:tiepoint][4] ], scale: [ tags[:pixel_scale][0], tags[:pixel_scale][1] ]
      }
    rescue NoMethodError, TypeError, ArgumentError => e
      raise Error, "unreadable header: #{e.message}"
    end

    # length bytes at offset: from what was read, else fetched.
    def slice(bytes, offset, length, fetch)
      return bytes.byteslice(offset, length) if offset + length <= bytes.bytesize
      raise Error, "header too large" unless fetch

      data = fetch.call(offset, offset + length - 1)
      raise Error, "header truncated" if data.nil? || data.bytesize < length

      data.byteslice(0, length)
    end
  end
end
