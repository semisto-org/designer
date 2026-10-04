require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../support/regions_test_helper"

class Providers::CadastreAdaptersTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include RegionsTestHelper

  APICARTO = %r{\Ahttps://apicarto\.ign\.fr/api/cadastre/parcelle}
  WFS = %r{\Ahttps://wms\.inspire\.geoportail\.lu/geoserver/cp/wfs}

  setup { seed_regions }

  def square(lng, lat, d = 0.0005)
    [ [ [ lng - d, lat - d ], [ lng + d, lat - d ], [ lng + d, lat + d ], [ lng - d, lat + d ], [ lng - d, lat - d ] ] ]
  end

  test "each region gets its own cadastre provider" do
    assert_kind_of Providers::Cadastre::Apicarto, Providers::Cadastre.for(region("france"))
    assert_kind_of Providers::Cadastre::InspireWfs, Providers::Cadastre.for(region("luxembourg"))
    assert_equal "cadastre", Providers::Cadastre.for(region("wallonia")).layer.key
    assert_nil Providers::Cadastre.for(Region.europe)
  end

  test "France: the parcel containing the point, from API Carto" do
    body = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [ square(2.36, 48.86) ] }, properties: { idu: "75105000AB0069" } },
      { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [ square(2.35, 48.85) ] },
        properties: { idu: "75105000AB0068", section: "AB", numero: "0068", nom_com: "Paris", contenance: 376 } }
    ] }
    stub_request(:get, APICARTO).to_return(status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" })
    parcel = Providers::Cadastre.for(region("france")).parcel_at(2.35, 48.85)
    assert_equal "75105000AB0068", parcel.capakey
    assert_equal "Parcelle AB 68", parcel.label
    assert_equal "Paris · 376 m²", parcel.detail
    assert_equal "MultiPolygon", parcel.geometry["type"]
    assert_requested(:get, APICARTO) { |r| JSON.parse(r.uri.query_values["geom"]) == { "type" => "Point", "coordinates" => [ 2.35, 48.85 ] } }
  end

  test "France: nothing here" do
    stub_request(:get, APICARTO).to_return(status: 200, body: { type: "FeatureCollection", features: [] }.to_json)
    assert_nil Providers::Cadastre.for(region("france")).parcel_at(2.35, 48.85)
  end

  test "France: a cached parcel is not asked again" do
    stub = stub_request(:get, APICARTO).to_return(status: 200, body: { features: [
      { geometry: { type: "MultiPolygon", coordinates: [ square(2.35, 48.85) ] }, properties: { idu: "75105000AB0068" } }
    ] }.to_json)
    with_memory_cache do
      cadastre = Providers::Cadastre.for(region("france"))
      cadastre.parcel_at(2.35, 48.85)
      assert_equal "75105000AB0068", cadastre.parcel("75105000AB0068", lng: 0, lat: 0).capakey
    end
    assert_requested stub, times: 1
  end

  test "Luxembourg: the INSPIRE WFS parcel, axes put back in lng/lat order" do
    lat_first = square(6.13, 49.61).map { |ring| ring.map(&:reverse) }
    body = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: lat_first },
        properties: { national_cadastral_reference: "075F00503002288", label: "503/2288", area: 10678.89 } }
    ] }
    stub_request(:get, WFS).to_return(status: 200, body: body.to_json)
    parcel = Providers::Cadastre.for(region("luxembourg")).parcel_at(6.13, 49.61)
    assert_equal "075F00503002288", parcel.capakey
    assert_equal "Parcelle 503/2288", parcel.label
    assert_equal "10 679 m²", parcel.detail
    assert_in_delta 6.1295, parcel.geometry["coordinates"][0][0][0], 0.0001
    assert_requested(:get, WFS) do |r|
      q = r.uri.query_values
      q["TYPENAMES"] == "cp:CP.CadastralParcel" && q["BBOX"].end_with?("urn:ogc:def:crs:EPSG::4326") && q["BBOX"].start_with?("49.6")
    end
  end

  test "upstream down: unavailable" do
    stub_request(:get, WFS).to_return(status: 503)
    assert_raises(Providers::GeoHttp::Unavailable) { Providers::Cadastre.for(region("luxembourg")).parcel_at(6.13, 49.61) }
  end
end
