# The fixed 127-byte header of a PMTiles v3 archive: what kind of tiles it
# holds, its zoom levels and where it lies. Enough to accept an archive
# someone imports and to place the view on the map, without reading tiles.
# https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
module AerialViews
  class PmtilesHeader
    MAGIC = "PMTiles".b
    LENGTH = 127
    TILE_TYPES = { 0 => "unknown", 1 => "mvt", 2 => "png", 3 => "jpeg", 4 => "webp", 5 => "avif" }.freeze
    RASTER_TYPES = %w[png jpeg webp avif].freeze

    attr_reader :tile_type, :min_zoom, :max_zoom, :bounds, :addressed_tiles

    # The header of the file at `path`, or nil when it is not a PMTiles v3 archive.
    def self.read(path)
      bytes = File.binread(path, LENGTH)
      return nil unless bytes && bytes.bytesize == LENGTH && bytes.start_with?(MAGIC) && bytes.getbyte(7) == 3
      new(bytes)
    end

    def initialize(bytes)
      @addressed_tiles = bytes.byteslice(72, 8).unpack1("Q<")
      @tile_type = TILE_TYPES.fetch(bytes.getbyte(99), "unknown")
      @min_zoom = bytes.getbyte(100)
      @max_zoom = bytes.getbyte(101)
      west, south, east, north = bytes.byteslice(102, 16).unpack("l<4").map { _1 / 10_000_000.0 }
      @bounds = { "west" => west, "south" => south, "east" => east, "north" => north }
    end

    def raster? = RASTER_TYPES.include?(tile_type)
  end
end
