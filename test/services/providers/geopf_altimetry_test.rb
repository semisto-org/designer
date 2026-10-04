require "test_helper"

class Providers::GeopfAltimetryTest < ActiveSupport::TestCase
  API = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json".freeze
  WMS = "https://data.geopf.fr/wms-r".freeze

  setup do
    @provider = Providers::GeopfAltimetry.new({
      "label" => "IGN", "chunk" => 5_000,
      "datasets" => { "terrain" => { "url" => API, "resource" => "ign_rge_alti_wld", "label" => "RGE ALTI" },
                      "texture" => { "url" => WMS, "layers" => "HR.ORTHOIMAGERY.ORTHOPHOTOS" } }
    }, sleeper: ->(_) { })
    @extent = Relief::Extent.around([ 2.35, 48.85, 2.3501, 48.8501 ], cell_size_m: 1, margin_m: 0)
    @points = Array.new(3) { |i| @extent.point(i) }
  end

  test "posts the points as lon/lat lists and reads one elevation each, no data as nil" do
    stub = stub_request(:post, API).with { |request|
      body = JSON.parse(request.body)
      body["lon"].split("|").size == 3 && body["lat"].split("|").first.to_f.round(4) == 48.8501 &&
        body["resource"] == "ign_rge_alti_wld" && body["zonly"] == "true"
    }.to_return(status: 200, body: { elevations: [ 33.8, -99999, 35.37 ] }.to_json)
    assert_equal [ 33.8, nil, 35.37 ], @provider.sample(:terrain, @points, @extent)
    assert_requested stub
  end

  test "refuses a short answer and retries server errors" do
    stub_request(:post, API).to_return({ status: 502 }, { status: 200, body: { elevations: [ 1, 2 ] }.to_json })
      .then.to_return(status: 200, body: { elevations: [ 1, 2 ] }.to_json)
    error = assert_raises(Providers::GeopfAltimetry::Error) { @provider.sample(:terrain, @points, @extent) }
    assert_match(/2 values for 3 points/, error.message)
  end

  test "the ortho comes from the WMS in EPSG:3857, aspect ratio kept" do
    stub_request(:get, %r{\A#{WMS}}).to_return(status: 200, body: "\xFF\xD8jpeg".b)
    texture = @provider.texture(@extent, max_px: 100)
    assert_equal "\xFF\xD8jpeg".b, texture[:bytes].b
    assert_requested(:get, %r{\A#{WMS}}) do |request|
      q = request.uri.query_values
      q["CRS"] == "EPSG:3857" && q["LAYERS"] == "HR.ORTHOIMAGERY.ORTHOPHOTOS" && q["WIDTH"].to_i <= 100
    end
  end

  test "terrain and texture only, never more than 5,000 points per request" do
    assert @provider.dataset?(:terrain)
    assert @provider.dataset?(:texture)
    assert_not @provider.dataset?(:surface)
    assert_equal 5_000, Providers::GeopfAltimetry.new({ "chunk" => 20_000 }).chunk_size
  end
end
