# Builds small stand-ins for the CHMv2 GeoTIFFs: a classic TIFF with the
# real geometry (32768 px square, 512 px tiles, uint8, DEFLATE) where only a
# few tiles exist, each filled with one height.
module CanopyTestHelper
  BASE = "https://chm.example.org/v2".freeze
  PX = Providers::CanopyHeight::FILE_PIXELS
  RES = Providers::CanopyHeight::RESOLUTION
  HALF = Providers::CanopyHeight::HALF_WORLD

  # Global zoom-17 pixel of a point.
  def global_pixel(lng, lat)
    x, y = Relief::Mercator.forward(lng, lat)
    [ ((x + HALF) / RES).floor, ((HALF - y) / RES).floor ]
  end

  # tiles: { [tx, ty] => height (Integer) or 512×512 String }.
  def canopy_tiff(fx, fy, tiles)
    tile_count = (PX / 512)**2
    blobs = tiles.to_h do |(tx, ty), value|
      raw = value.is_a?(String) ? value : ([ value ].pack("C") * (512 * 512))
      [ ty * (PX / 512) + tx, Zlib::Deflate.deflate(raw) ]
    end
    entries = [ [ 256, 4, 1, PX ], [ 257, 4, 1, PX ], [ 258, 3, 1, 8 ], [ 259, 3, 1, 8 ], [ 322, 3, 1, 512 ], [ 323, 3, 1, 512 ],
                [ 324, 4, tile_count, :offsets ], [ 325, 4, tile_count, :counts ], [ 339, 3, 1, 1 ],
                [ 33550, 12, 3, :scale ], [ 33922, 12, 6, :tie ] ]
    ifd_size = 2 + entries.size * 12 + 4
    at = { offsets: 8 + ifd_size }
    at[:counts] = at[:offsets] + tile_count * 4
    at[:scale] = at[:counts] + tile_count * 4
    at[:tie] = at[:scale] + 24
    data_at = at[:tie] + 48
    offsets, counts = Array.new(tile_count, 0), Array.new(tile_count, 0)
    position = data_at
    blobs.sort.each do |index, blob|
      offsets[index], counts[index] = position, blob.bytesize
      position += blob.bytesize
    end
    ifd = [ entries.size ].pack("v") + entries.map do |tag, type, count, value|
      value = at.fetch(value) if value.is_a?(Symbol)
      [ tag, type, count ].pack("vvV") + (type == 3 ? [ value, 0 ].pack("vv") : [ value ].pack("V"))
    end.join + [ 0 ].pack("V")
    origin = [ fx * PX * RES - HALF, HALF - fy * PX * RES ]
    "II".b + [ 42, 8 ].pack("vV") + ifd + offsets.pack("V*") + counts.pack("V*") +
      [ RES, RES, 0.0 ].pack("E3") + [ 0, 0, 0, origin[0], origin[1], 0.0 ].pack("E6") + blobs.sort.map(&:last).join
  end

  # Answers range requests on url from the bytes.
  def stub_ranged(url, bytes)
    stub_request(:get, url).to_return do |request|
      first, last = request.headers["Range"].delete_prefix("bytes=").split("-").map(&:to_i)
      { status: 206, body: bytes.byteslice(first, last - first + 1) }
    end
  end
end
