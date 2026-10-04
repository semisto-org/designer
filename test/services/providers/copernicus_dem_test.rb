require "test_helper"

class Providers::CopernicusDemTest < ActiveSupport::TestCase
  BUCKET = "https://dem.example.org".freeze
  FILE = "#{BUCKET}/Copernicus_DSM_COG_10_N50_00_E004_00_DEM/Copernicus_DSM_COG_10_N50_00_E004_00_DEM.tif".freeze

  # A 4 × 4 px tiled GeoTIFF over N50–51 E4–5 (0.25° pixels), encoded the
  # way the Copernicus COGs are: float32, floating point predictor, DEFLATE.
  def tiff(values)
    tile = values.each_slice(4).map do |row|
      bytes = row.map { |v| [ v ].pack("g").bytes }
      planes = (0..3).flat_map { |plane| bytes.map { _1[plane] } }
      planes.each_index.reverse_each.map { |i| i.zero? ? planes[0] : (planes[i] - planes[i - 1]) & 0xFF }.reverse
    end.flatten.pack("C*")
    data = Zlib::Deflate.deflate(tile)

    entries = [ [ 256, 3, 1, 4 ], [ 257, 3, 1, 4 ], [ 259, 3, 1, 8 ], [ 317, 3, 1, 3 ], [ 322, 3, 1, 4 ], [ 323, 3, 1, 4 ],
                [ 324, 4, 1, nil ], [ 325, 4, 1, data.bytesize ], [ 339, 3, 1, 3 ], [ 33550, 12, 3, nil ], [ 33922, 12, 6, nil ] ]
    ifd_size = 2 + entries.size * 12 + 4
    scale_at = 8 + ifd_size
    tie_at = scale_at + 24
    tile_at = tie_at + 48
    ifd = [ entries.size ].pack("v") + entries.map do |tag, type, count, value|
      value = { 324 => tile_at, 33550 => scale_at, 33922 => tie_at }.fetch(tag, value)
      [ tag, type, count ].pack("vvV") + (type == 3 ? [ value, 0 ].pack("vv") : [ value ].pack("V"))
    end.join + [ 0 ].pack("V")
    "II".b + [ 42, 8 ].pack("vV") + ifd + [ 0.25, 0.25, 0.0 ].pack("E3") + [ 0, 0, 0, 4.0, 51.0, 0.0 ].pack("E6") + data
  end

  setup do
    @values = [ 100.5, 101, 102, 103, 110, 111, 112, 113, 120, 121, -32767, 123, 130, 131, 132, 133 ]
    @file = tiff(@values)
    stub_request(:get, FILE).to_return do |request|
      first, last = request.headers["Range"].delete_prefix("bytes=").split("-").map(&:to_i)
      { status: 206, body: @file.byteslice(first, last - first + 1) }
    end
    @provider = Providers::CopernicusDem.new({ "label" => "Copernicus", "datasets" => { "terrain" => { "url" => BUCKET, "label" => "GLO-30" } } })
  end

  def mercator(lng, lat) = Relief::Mercator.forward(lng, lat)

  test "interpolates between the four nearest pixel centres" do
    assert_equal [ 103.03 ], @provider.sample(:terrain, [ mercator(4.1875, 50.8125) ], nil)
  end

  test "the nearest pixel at a file edge or next to no data, no data as nil" do
    points = [ mercator(4.1, 50.9), mercator(4.3, 50.9), mercator(4.9, 50.1), mercator(4.6, 50.4) ]
    assert_equal [ 100.5, 101.0, 133.0, nil ], @provider.sample(:terrain, points, nil)
  end

  test "a missing file is sea: no data" do
    stub_request(:get, %r{N51_00_E004}).to_return(status: 404)
    assert_equal [ nil ], @provider.sample(:terrain, [ mercator(4.5, 51.5) ], nil)
  end

  test "names files after their south-west corner" do
    assert_match "Copernicus_DSM_COG_10_S01_00_W002_00_DEM.tif", @provider.file_url(-1, -2)
  end

  test "only a terrain dataset; refuses anything else" do
    assert @provider.dataset?(:terrain)
    assert_not @provider.dataset?(:texture)
    assert_raises(Providers::CopernicusDem::Error) { @provider.sample(:surface, [], nil) }
  end

  test "the European region uses it" do
    region = Region.create!(key: "europe", name: "Europe", country_code: "EU",
                            settings: { "relief" => { "provider" => "copernicus_dem", "datasets" => { "terrain" => { "url" => BUCKET } } } })
    assert_kind_of Providers::CopernicusDem, Providers::Elevation.for(region)
  end
end
