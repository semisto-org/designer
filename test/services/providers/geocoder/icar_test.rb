require "test_helper"

class Providers::Geocoder::IcarTest < ActiveSupport::TestCase
  URL = "https://geoservices.wallonie.be/arcgis/rest/services/DONNEES_BASE/ICAR_ADR_PT/MapServer".freeze

  setup do
    @wallonia = regions(:wallonia)
    @wallonia.update!(settings: @wallonia.settings.merge("geocoder" => { "provider" => "icar", "icar" => { "url" => URL } }))
  end

  def arcgis(features) = { status: 200, headers: { "Content-Type" => "application/json" }, body: { features: }.to_json }
  def where_of(request) = Rack::Utils.parse_query(URI(request.uri).query)["where"].to_s

  test "splits an address into a number, a postcode and the words of its street" do
    parsed = Providers::Geocoder::Icar.parse("Rue du Moulin 12, 5530 Yvoir")
    assert_equal "12", parsed[:number]
    assert_equal "5530", parsed[:postcode]
    assert_equal %w[MOULIN YVOIR], parsed[:words]
    assert_equal %w[RUE DU MOULIN YVOIR], parsed[:tokens]
    assert_equal %w[EGLISE], Providers::Geocoder::Icar.parse("Rue de l'Église")[:words]
  end

  test "in Wallonia, the official register answers first with the exact house" do
    stub = stub_request(:get, %r{\A#{Regexp.escape(URL)}/1/query}).with { |request|
      where = where_of(request)
      where.include?("ADR_NUMERO = '1'") && where.include?("LIKE '%FONDS%'") && where.include?("LIKE '%AHINVAUX%'") &&
        where.include?("CODE_POSTAL = '5530'") && where.include?("ADR_FIN IS NULL")
    }.to_return(arcgis([
      { attributes: { ADR_NUMERO: "1", RUE_NM: "Fonds d'Ahinvaux", CODE_POSTAL: "5530", COM_NM: "Yvoir" }, geometry: { x: 4.9072, y: 50.3423 } }
    ]))
    nominatim = stub_request(:get, /nominatim/)

    results = Providers::Geocoder.build({}).search("Fonds d'Ahinvaux 1, 5530 Yvoir", region: @wallonia)
    assert_requested stub
    assert_not_requested nominatim
    assert_equal [ "Fonds d'Ahinvaux 1, 5530 Yvoir" ], results.map(&:label)
    assert_equal [ 4.9072, 50.3423, 19, "ICAR" ], [ results.first.lng, results.first.lat, results.first.zoom, results.first.detail ]
  end

  test "an E stands for any letter, as the register writes Eglise or Église" do
    stub = stub_request(:get, %r{\A#{Regexp.escape(URL)}/1/query}).with { |request| where_of(request).include?("LIKE '%_GLIS_%'") }
      .to_return(arcgis([ { attributes: { ADR_NUMERO: "1", RUE_NM: "Rue de l'Eglise", CODE_POSTAL: "5530", COM_NM: "Yvoir" }, geometry: { x: 4.97, y: 50.31 } } ]))
    assert_equal [ "Rue de l'Eglise 1, 5530 Yvoir" ], Providers::Geocoder.build({}).search("Rue de l'Église 1 Yvoir", region: @wallonia).map(&:label)
    assert_requested stub
  end

  test "whole words first: Grand-Place before Grand-Rue" do
    stub_request(:get, %r{\A#{Regexp.escape(URL)}/1/query}).to_return(arcgis([
      { attributes: { ADR_NUMERO: "1", RUE_NM: "Grand-Rue", CODE_POSTAL: "7000", COM_NM: "Mons" }, geometry: { x: 3.95, y: 50.45 } },
      { attributes: { ADR_NUMERO: "1", RUE_NM: "Grand-Place", CODE_POSTAL: "7000", COM_NM: "Mons" }, geometry: { x: 3.95, y: 50.45 } }
    ]))
    assert_equal "Grand-Place 1, 7000 Mons", Providers::Geocoder.build({}).search("Grand-Place 1 Mons", region: @wallonia).first.label
  end

  test "no number: the middle of the street, framed by its line" do
    stub_request(:get, %r{\A#{Regexp.escape(URL)}/4/query}).to_return(arcgis([
      { attributes: { RUE_NM: "Fonds d'Ahinvaux", COM_NM: "Yvoir" }, geometry: { paths: [ [ [ 4.900, 50.330 ], [ 4.905, 50.338 ], [ 4.910, 50.345 ] ] ] } }
    ]))
    result = Providers::Geocoder.build({}).search("Fond d'Ahinvaux Yvoir", region: @wallonia).first
    assert_equal "Fonds d'Ahinvaux, Yvoir", result.label
    assert_equal [ 4.905, 50.338 ], [ result.lng, result.lat ]
    assert_equal [ 4.9, 50.33, 4.91, 50.345 ], result.bbox
  end

  test "a number the register does not know: the street instead" do
    stub_request(:get, %r{\A#{Regexp.escape(URL)}/1/query}).to_return(arcgis([]))
    streets = stub_request(:get, %r{\A#{Regexp.escape(URL)}/4/query}).to_return(arcgis([
      { attributes: { RUE_NM: "Rue du Bois", COM_NM: "Yvoir" }, geometry: { paths: [ [ [ 4.88, 50.32 ], [ 4.89, 50.33 ] ] ] } }
    ]))
    assert_equal [ "Rue du Bois, Yvoir" ], Providers::Geocoder.build({}).search("Rue du Bois 999 Yvoir", region: @wallonia).map(&:label)
    assert_requested streets
  end

  test "the register down: OpenStreetMap answers" do
    stub_request(:get, %r{#{Regexp.escape(URL)}}).to_return(status: 503)
    nominatim = stub_request(:get, /nominatim/).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: "[]")
    stub_request(:get, /photon/).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: { features: [] }.to_json)
    assert_equal [], Providers::Geocoder.build({}).search("Rue du Bois 3 Yvoir", region: @wallonia)
    assert_requested nominatim
  end

  test "an error body counts as unavailable" do
    stub_request(:get, %r{#{Regexp.escape(URL)}}).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: { error: { code: 400 } }.to_json)
    assert_raises(Providers::GeoHttp::Unavailable) { Providers::Geocoder::Icar.new(url: URL).search("Rue du Bois 3") }
  end
end
