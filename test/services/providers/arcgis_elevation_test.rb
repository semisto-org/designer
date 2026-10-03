require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class Providers::ArcgisElevationTest < ActiveSupport::TestCase
  include ReliefTestHelper

  setup do
    configure_relief_region
    @provider = instant_provider
    @extent = Relief::Extent.around([ 4.9, 50.34, 4.9001, 50.3401 ], cell_size_m: 1, margin_m: 0)
    @points = Array.new(4) { |i| @extent.point(i) }
  end

  test "the region decides the provider; other regions have none" do
    assert_kind_of Providers::ArcgisElevation, @provider
    assert_equal "SPW de test", @provider.label
    assert @provider.dataset?(:surface)
    other = Region.create!(key: "flanders", name: "Flandre", country_code: "BE")
    assert_nil Providers::Elevation.for(other)
    assert_not Providers::Elevation.available?(other)
  end

  test "identify posts a MULTIPOINT and returns one height per point, NoData as nil" do
    stub = stub_request(:post, "#{ReliefTestHelper::MNT}/identify")
      .with { |request|
        params = URI.decode_www_form(request.body).to_h
        params["geometryType"] == "esriGeometryMultipoint" && params["sr"] == "3857" && params["tolerance"] == "0" &&
          JSON.parse(params["geometry"])["points"].size == 4 && params["layers"] == "all:0"
      }
      .to_return(status: 200, body: file_fixture("relief/identify_mnt.json").read)
    assert_equal [ 245.37, 245.12, nil, 244.98 ], @provider.sample(:terrain, @points, @extent)
    assert_requested stub
  end

  test "land cover classes are integers" do
    stub_request(:post, "#{ReliefTestHelper::OCS}/identify").to_return(status: 200, body: file_fixture("relief/identify_landcover.json").read)
    assert_equal [ 7, 9, 2, nil ], @provider.sample(:landcover, @points, @extent)
  end

  test "retries server errors and ArcGIS errors, then succeeds" do
    stub_request(:post, "#{ReliefTestHelper::MNT}/identify")
      .to_return({ status: 503, body: "busy" }, { status: 200, body: file_fixture("relief/identify_error.json").read },
                 { status: 200, body: file_fixture("relief/identify_mnt.json").read })
    assert_equal 245.37, @provider.sample(:terrain, @points, @extent).first
  end

  test "retries timeouts" do
    stub_request(:post, "#{ReliefTestHelper::MNT}/identify").to_timeout.then
      .to_return(status: 200, body: file_fixture("relief/identify_mnt.json").read)
    assert_equal 4, @provider.sample(:terrain, @points, @extent).size
  end

  test "refuses a short answer rather than shifting the grid" do
    stub_request(:post, "#{ReliefTestHelper::MNT}/identify").to_return(status: 200, body: file_fixture("relief/identify_mnt.json").read)
    error = assert_raises(Providers::ArcgisElevation::Error) { @provider.sample(:terrain, @points.first(3), @extent) }
    assert_match(/4 values for 3 points/, error.message)
  end

  test "gives up after three attempts" do
    stub = stub_request(:post, "#{ReliefTestHelper::MNT}/identify").to_return(status: 500, body: "down")
    assert_raises(Providers::ArcgisElevation::Error) { @provider.sample(:terrain, @points, @extent) }
    assert_requested stub, times: 3
  end

  test "texture keeps the extent's aspect ratio and checks it is a JPEG" do
    extent = Relief::Extent.around([ 4.9, 50.34, 4.902, 50.341 ], cell_size_m: 1, margin_m: 0)
    stub = stub_request(:get, %r{#{Regexp.escape(ReliefTestHelper::ORTHO)}/export})
      .with(query: hash_including("f" => "image", "format" => "jpg", "bboxSR" => "3857", "imageSR" => "3857"))
      .to_return(status: 200, body: ReliefTestHelper::JPEG)
    texture = @provider.texture(extent, max_px: 400)
    assert_equal 400, texture[:width]
    assert_in_delta 400.0 * extent.height_m / extent.width_m, texture[:height], 1
    assert_requested stub

    stub_request(:get, %r{#{Regexp.escape(ReliefTestHelper::ORTHO)}/export}).to_return(status: 200, body: "<html>")
    assert_raises(Providers::ArcgisElevation::Error) { @provider.texture(extent) }
  end
end
