require "test_helper"

class AerialViews::PmtilesReaderTest < ActiveSupport::TestCase
  FIXTURE = Rails.root.join("test/fixtures/files/drone-view.pmtiles")

  def reader_of(bytes)
    reads = []
    reader = AerialViews::PmtilesReader.new(cache_key: SecureRandom.hex(4)) do |offset, length|
      reads << [ offset, length ]
      bytes.byteslice(offset, length)
    end
    [ reader, reads ]
  end

  test "tile ids follow the spec's Hilbert curve" do
    # Values from the reference implementation (pmtiles on PyPI).
    assert_equal [ 0, 1, 2, 3, 4 ], [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 1, 0, 1 ], [ 1, 1, 1 ], [ 1, 1, 0 ] ].map { AerialViews::PmtilesReader.tile_id(*_1) }
    assert_equal 76, AerialViews::PmtilesReader.tile_id(3, 5, 2)
    assert_equal 531_431_376_405, AerialViews::PmtilesReader.tile_id(20, 523_000, 350_000)
  end

  test "cuts a tile out of a drone archive, reading only the bytes it needs" do
    reader, reads = reader_of(File.binread(FIXTURE))
    bytes, type = reader.tile(18, 134_622, 88_532)
    assert_equal "image/webp", type
    assert bytes.start_with?("RIFF"), "a WebP image"
    assert_equal 2, reads.size # the first block (header + root directory), then the tile
    assert_nil reader.tile(18, 134_000, 88_000), "no tile there"
    assert_nil reader.tile(12, 2103, 1383), "above the archive's zooms"
    assert_nil reader.tile(18, -1, 2), "not a tile"
  end

  test "follows a leaf directory" do
    tile = "tile-bytes".b
    target = AerialViews::PmtilesReader.tile_id(20, 536_385, 355_239)
    leaf = directory([ [ target - 1, 0, 3, 1 ], [ target, 3, tile.bytesize, 1 ] ])
    root = directory([ [ target - 1, 0, leaf.bytesize, 0 ] ]) # run length 0: a leaf
    data = "xyz".b + tile
    header = "PMTiles".b + [ 3 ].pack("C")
    header += [ 127, root.bytesize, 0, 0, 127 + root.bytesize, leaf.bytesize, 127 + root.bytesize + leaf.bytesize, data.bytesize, 2, 2, 2 ].pack("Q<11")
    header += [ 0, 1, 1, 2, 20, 20 ].pack("C6") # not clustered, no compression, PNG, zoom 20
    header += "\0".b * (127 - header.bytesize)
    reader, = reader_of(header + root + leaf + data)
    assert_equal [ tile, "image/png" ], reader.tile(20, 536_385, 355_239)
    assert_nil reader.tile(20, 100, 100), "before every entry"
  end

  test "refuses what is not an archive" do
    reader, = reader_of("not an archive".b * 20)
    assert_raises(AerialViews::PmtilesReader::Unreadable) { reader.tile(18, 1, 1) }
  end

  private
    # [tile id, offset, length, run length] entries, as the spec writes them (uncompressed).
    def directory(entries)
      varint = lambda do |n|
        out = +"".b
        loop do
          byte = n & 0x7f
          n >>= 7
          out << (n.zero? ? byte : byte | 0x80).chr
          return out if n.zero?
        end
      end
      last = 0
      bytes = varint.(entries.size)
      entries.each { |id, *| bytes << varint.(id - last); last = id }
      entries.each { |*, run| bytes << varint.(run) }
      entries.each { |_, _, length, _| bytes << varint.(length) }
      entries.each { |_, offset, *| bytes << varint.(offset + 1) }
      bytes
    end
end
