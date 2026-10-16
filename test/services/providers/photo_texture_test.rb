require "test_helper"
require_relative "../../test_helpers/relief_test_helper"
require_relative "../../support/regions_test_helper"

class Providers::PhotoTextureTest < ActiveSupport::TestCase
  include RegionsTestHelper
  include ActiveJob::TestHelper

  setup do
    seed_regions
    @extent = Relief::Extent.around([ 4.36, 50.83, 4.365, 50.832 ], cell_size_m: 1, margin_m: 150)
  end

  test "Brussels and Flanders get their photo under the European relief" do
    { "brussels" => "geoservices-urbis.irisnet.be/geoserver/urbisgrid/wms", "flanders" => "geo.api.vlaanderen.be/OMWRGBMRVL/wms" }.each do |key, url|
      provider = Providers::Elevation.for(region(key))
      assert_equal "copernicus_dem", provider.key
      assert provider.dataset?(:texture), key
      assert provider.dataset?(:terrain), key
      assert_not provider.dataset?(:surface), key
      assert_includes provider.layer.url, url
      assert_match(/copernicus.* ; ©/i, provider.attribution)
    end
    assert_match "UrbIS", Providers::Elevation.for(region("brussels")).dataset_label(:texture)
  end

  test "a provider with its own photo, or a region whose photo comes in tiles, is left as is" do
    assert_kind_of Providers::ArcgisElevation, Providers::Elevation.for(region("wallonia"))
    assert_kind_of Providers::GeopfAltimetry, Providers::Elevation.for(region("france"))
    assert_kind_of Providers::CopernicusDem, Providers::Elevation.for(region("luxembourg"))
    assert_kind_of Providers::CopernicusDem, Providers::Elevation.for(region("europe"))
  end

  test "one GetMap of the photo on the grid's extent, in EPSG:3857" do
    request = stub_request(:get, %r{\Ahttps://geoservices-urbis\.irisnet\.be/geoserver/urbisgrid/wms\?})
      .with(query: hash_including("REQUEST" => "GetMap", "LAYERS" => "Ortho", "CRS" => "EPSG:3857", "FORMAT" => "image/jpeg"))
      .to_return(status: 200, body: ReliefTestHelper::JPEG, headers: { "Content-Type" => "image/jpeg" })

    texture = Providers::Elevation.for(region("brussels")).texture(@extent)

    assert_requested request
    assert_equal ReliefTestHelper::JPEG, texture[:bytes]
    assert_equal 2048, [ texture[:width], texture[:height] ].max
    ratio = (@extent.east - @extent.west) / (@extent.north - @extent.south)
    assert_in_delta ratio, texture[:width].fdiv(texture[:height]), 0.01
    bbox = request_bbox
    assert_in_delta @extent.west, bbox[0], 0.01
    assert_in_delta @extent.north, bbox[3], 0.01
  end

  test "an error page instead of a photo fails the texture, not the relief" do
    stub_request(:get, /urbisgrid/).to_return(status: 200, body: "<ServiceExceptionReport/>", headers: { "Content-Type" => "text/xml" })
    assert_raises(Providers::PhotoTexture::Error) { Providers::Elevation.for(region("brussels")).texture(@extent) }
  end

  test "a relief imported without a photo is imported again once, on the next deploy" do
    map = Map.create!(name: "Jardin bruxellois", owner: users(:michael), region: region("brussels"))
    terrain = map.create_terrain!(status: "ready")
    warned = Map.create!(name: "Déjà essayé", owner: users(:michael), region: region("flanders"))
      .create_terrain!(status: "ready", metadata: { "warnings" => [ I18n.t("relief.warnings.texture") ] })
    luxembourgish = Map.create!(name: "Jardin luxembourgeois", owner: users(:michael), region: region("luxembourg")).create_terrain!(status: "ready")

    load Rails.root.join("db/seeds/40_relief.rb").to_s

    jobs = enqueued_jobs.select { _1["job_class"] == "ReliefImportJob" }.map { GlobalID::Locator.locate(_1["arguments"].first["_aj_globalid"]) }
    assert_includes jobs, terrain
    assert_not_includes jobs, warned
    assert_not_includes jobs, luxembourgish
  end

  private
    def request_bbox
      uri = WebMock::RequestRegistry.instance.requested_signatures.hash.keys.map(&:uri).find { _1.host.include?("urbis") }
      Rack::Utils.parse_query(uri.query)["BBOX"].split(",").map(&:to_f)
    end
end
