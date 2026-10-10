require "test_helper"

class Providers::GeoTiffHeaderTest < ActiveSupport::TestCase
  test "reads the first directory of a real CHMv2 file" do
    header = Providers::GeoTiffHeader.parse(file_fixture("canopy/chm_1202023103_header.bin").binread)

    assert_equal [ 32_768, 32_768, 512, 512 ], header.values_at(:width, :height, :tile_width, :tile_height)
    assert_equal [ 8, 1, 8, 1 ], header.values_at(:compression, :predictor, :bits, :sample_format)
    assert_equal 4096, header[:offsets].size
    assert_equal [ 57_375_296, 25_666 ], [ header[:offsets].first, header[:byte_counts].first ]
    assert_in_delta 508_764.86, header[:origin][0], 0.01
    assert_in_delta Providers::CanopyHeight::RESOLUTION, header[:scale][0], 1e-9
  end

  # A BigTIFF whose tile offsets lie past the bytes read: they are fetched.
  def bigtiff
    entries = [ [ 256, 16, 1, 1024 ], [ 257, 16, 1, 1024 ], [ 258, 3, 1, 8 ], [ 259, 3, 1, 1 ], [ 322, 3, 1, 512 ],
                [ 323, 3, 1, 512 ], [ 324, 16, 4, :offsets ], [ 325, 16, 4, :counts ], [ 33550, 12, 3, :scale ], [ 33922, 12, 6, :tie ] ]
    ifd_size = 8 + entries.size * 20 + 8
    at = { scale: 16 + ifd_size }
    at[:tie] = at[:scale] + 24
    at[:offsets] = 4096
    at[:counts] = at[:offsets] + 32
    ifd = [ entries.size ].pack("Q<") + entries.map do |tag, type, count, value|
      value = at.fetch(value) if value.is_a?(Symbol)
      [ tag, type, count ].pack("vvQ<") + (type == 3 ? [ value, 0, 0, 0 ].pack("vvvv") : [ value ].pack("Q<"))
    end.join + [ 0 ].pack("Q<")
    head = "II".b + [ 43, 8, 0, 16 ].pack("vvvQ<") + ifd + [ 2.0, 2.0, 0.0 ].pack("E3") + [ 0, 0, 0, 100.0, 200.0, 0.0 ].pack("E6")
    head.ljust(4096, "\0") + [ 10, 20, 30, 40 ].pack("Q<4") + [ 1, 2, 3, 4 ].pack("Q<4")
  end

  test "BigTIFF, with values fetched beyond the first bytes" do
    file = bigtiff
    fetched = []
    header = Providers::GeoTiffHeader.parse(file.byteslice(0, 1024), fetch: ->(first, last) { fetched << [ first, last ]; file.byteslice(first..last) })

    assert_equal [ 1024, 512, 1 ], header.values_at(:width, :tile_width, :compression)
    assert_equal [ 10, 20, 30, 40 ], header[:offsets]
    assert_equal [ 1, 2, 3, 4 ], header[:byte_counts]
    assert_equal [ 100.0, 200.0 ], header[:origin]
    assert_equal [ [ 4096, 4127 ], [ 4128, 4159 ] ], fetched
  end

  test "refuses what it cannot read" do
    assert_raises(Providers::GeoTiffHeader::Error) { Providers::GeoTiffHeader.parse("GIF89a....") }
    assert_raises(Providers::GeoTiffHeader::Error) { Providers::GeoTiffHeader.parse(bigtiff.byteslice(0, 1024)) }
  end
end
