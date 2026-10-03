# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Relief
  # Binary encodings of the grids, read by the browser as typed arrays.
  #
  # Heights: Uint16 little-endian, row by row from north to south, west to
  # east, in units of `z_unit` (1 cm) above `z_min`; 65535 = no data. A 1 m
  # grid of ~1 km² weighs ~3.4 MB, and the unit keeps centimetre precision.
  #
  # Land cover: one byte per cell (the provider's class code, 255 = unknown).
  module Raster
    NODATA = 65_535
    Z_UNIT = 0.01
    LANDCOVER_NODATA = 255

    Packed = Data.define(:bytes, :z_min, :z_max, :nodata_count)

    module_function

    def pack_heights(heights, z_unit: Z_UNIT)
      known = heights.compact
      raise ArgumentError, "no height received" if known.empty?

      z_min = known.min.floor(2)
      raw = heights.map { |z| z.nil? ? NODATA : ((z - z_min) / z_unit).round.clamp(0, NODATA - 1) }
      Packed.new(bytes: raw.pack("v*"), z_min:, z_max: known.max, nodata_count: heights.size - known.size)
    end

    def unpack_heights(bytes, z_min:, z_unit: Z_UNIT)
      bytes.unpack("v*").map { |raw| raw == NODATA ? nil : z_min + raw * z_unit }
    end

    def pack_classes(classes)
      classes.map { |c| c.nil? || c.negative? || c >= LANDCOVER_NODATA ? LANDCOVER_NODATA : c }.pack("C*")
    end
  end
end
