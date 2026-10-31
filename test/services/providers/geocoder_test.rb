require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::GeocoderTest < ActiveSupport::TestCase
  include MapDataTestHelper

  test "nominatim by default, restricted to the region, with a contact" do
    stub = stub_request(:get, %r{\Ahttps://nominatim\.openstreetmap\.org/search})
      .with(query: hash_including("q" => "Rue du Bois 3 Yvoir", "format" => "jsonv2", "countrycodes" => "be",
                                  "viewbox" => "2.84,49.49,6.41,50.82", "bounded" => "1", "email" => "carto@example.org"),
            headers: { "User-Agent" => /SemistoTerranova.*carto@example\.org/ })
      .to_return(json_response("nominatim_search.json"))
    geocoder = Providers::Geocoder.build("GEOCODER_USER_AGENT_EMAIL" => "carto@example.org")
    assert geocoder.available?

    results = geocoder.search("  Rue du Bois 3   Yvoir ", region: regions(:wallonia))
    assert_requested stub
    house, village = results
    assert_equal "Rue du Bois 3, 5530 Yvoir", house.label
    assert_equal "Dinant, Namur", house.detail
    assert_equal [ 4.8801242, 50.3289013 ], [ house.lng, house.lat ]
    assert_equal 18, house.zoom
    assert_equal "Yvoir, 5530 Yvoir", village.label
    assert_operator village.zoom, :<, 15
  end

  test "photon, filtered to the region's country" do
    stub_request(:get, %r{\Ahttps://photon\.example\.org/api}).with(query: hash_including("q" => "Rue du Bois", "lang" => "fr"))
      .to_return(json_response("photon_search.json"))
    geocoder = Providers::Geocoder.build("GEOCODER_PROVIDER" => "photon", "GEOCODER_URL" => "https://photon.example.org/")
    results = geocoder.search("Rue du Bois", region: regions(:wallonia))
    assert_equal [ "Rue du Bois 3, 5530 Yvoir" ], results.map(&:label)
  end

  test "nothing found by nominatim: asks photon, which tolerates a plural" do
    # OSM names the road "Fond d'Ahinvaux"; people write "Fonds d'Ahinvaux".
    stub_request(:get, %r{\Ahttps://nominatim\.openstreetmap\.org/search}).to_return(status: 200, body: "[]", headers: { "Content-Type" => "application/json" })
    photon = stub_request(:get, %r{\Ahttps://photon\.komoot\.io/api}).with(query: hash_including("q" => "Fonds d'Ahinvaux, Yvoir"))
      .to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
        type: "FeatureCollection",
        features: [ {
          type: "Feature",
          geometry: { type: "Point", coordinates: [ 4.9063654, 50.3398802 ] },
          properties: { name: "Fond d'Ahinvaux", city: "Yvoir", postcode: "5530", county: "Dinant", state: "Namur",
                        countrycode: "BE", extent: [ 4.905915, 50.3425901, 4.907929, 50.3373471 ] }
        } ]
      }.to_json)

    results = Providers::Geocoder.build({}).search("Fonds d'Ahinvaux, Yvoir", region: regions(:wallonia))
    assert_requested photon
    assert_equal [ "Fond d'Ahinvaux, 5530 Yvoir" ], results.map(&:label)
    assert_equal [ 4.9063654, 50.3398802 ], [ results.first.lng, results.first.lat ]
  end

  test "nominatim down: photon answers" do
    stub_request(:get, %r{nominatim}).to_return(status: 429)
    stub_request(:get, %r{photon}).to_return(json_response("photon_search.json"))
    results = Providers::Geocoder.build({}).search("Rue du Bois", region: regions(:wallonia))
    assert_equal [ "Rue du Bois 3, 5530 Yvoir" ], results.map(&:label)
  end

  test "the fallback can be switched off" do
    stub_request(:get, %r{nominatim}).to_return(status: 200, body: "[]", headers: { "Content-Type" => "application/json" })
    assert_empty Providers::Geocoder.build("GEOCODER_FALLBACK" => "none").search("Fonds d'Ahinvaux, Yvoir")
    assert_not_requested :get, %r{photon}
  end

  test "can be switched off" do
    geocoder = Providers::Geocoder.build("GEOCODER_PROVIDER" => "none")
    assert_not geocoder.available?
    assert_raises(Providers::Geocoder::Unavailable) { geocoder.search("Yvoir") }
  end

  test "short queries do not call the provider; failures raise Unavailable" do
    geocoder = Providers::Geocoder.build({})
    assert_empty geocoder.search("ab")
    stub_request(:get, %r{nominatim}).to_timeout
    stub_request(:get, %r{photon}).to_timeout
    assert_raises(Providers::Geocoder::Unavailable) { geocoder.search("Yvoir") }
  end

  test "results are cached" do
    stub = stub_request(:get, %r{nominatim}).to_return(json_response("nominatim_search.json"))
    with_memory_cache do
      Providers::Geocoder.build({}).search("Yvoir", region: regions(:wallonia))
      travel 2.seconds do
        assert_equal 2, Providers::Geocoder.build({}).search("yvoir", region: regions(:wallonia)).size
      end
    end
    assert_requested stub, times: 1
  end

  def ban_response(*features)
    { status: 200, headers: { "Content-Type" => "application/json" }, body: { type: "FeatureCollection", features: }.to_json }
  end

  def ban_feature(label_name, type:, score:, lng: -0.3637, lat: 49.1829)
    { type: "Feature", geometry: { type: "Point", coordinates: [ lng, lat ] },
      properties: { name: label_name, postcode: "14000", city: "Caen", context: "14, Calvados, Normandie", type:, score: } }
  end

  def france
    Region.create!(key: "france_test", name: "France", country_code: "FR", locale: "fr", active: true, default_zoom: 6,
                   settings: { "geocoder" => { "provider" => "ban" } })
  end

  def europe
    Region.create!(key: "europe_test", name: "Europe", country_code: "EU", locale: "fr", active: true, default_zoom: 5,
                   settings: { "geocoder" => { "house_numbers" => "ban" } })
  end

  test "in France the national address base answers first, house number included" do
    # OSM did not know Clémence's house number in Normandy (test of October 2026).
    ban = stub_request(:get, "https://data.geopf.fr/geocodage/search").with(query: hash_including("q" => "10 rue Ecuyere Caen", "index" => "address"))
      .to_return(ban_response(ban_feature("10 Rue Écuyère", type: "housenumber", score: 0.98), ban_feature("Impasse Ecuyère", type: "street", score: 0.5),
                              ban_feature("Rue au hasard", type: "street", score: 0.2)))
    nominatim = stub_request(:get, %r{nominatim})

    results = Providers::Geocoder.build({}).search("10 rue Ecuyere Caen", region: france)
    assert_requested ban
    assert_not_requested nominatim
    assert_equal [ "10 Rue Écuyère, 14000 Caen", "Impasse Ecuyère, 14000 Caen" ], results.map(&:label)
    assert_equal "Calvados, Normandie", results.first.detail
    assert_equal [ 19, 17 ], results.map(&:zoom)
  end

  test "in France, nothing at the national base: OpenStreetMap after it" do
    stub_request(:get, %r{data\.geopf\.fr}).to_return(ban_response)
    stub_request(:get, %r{nominatim}).to_return(json_response("nominatim_search.json"))
    results = Providers::Geocoder.build({}).search("Lieu-dit des Saules", region: france)
    assert_equal "Rue du Bois 3, 5530 Yvoir", results.first.label
  end

  test "in France, the national base down: OpenStreetMap answers" do
    stub_request(:get, %r{data\.geopf\.fr}).to_return(status: 503)
    stub_request(:get, %r{nominatim}).to_return(json_response("nominatim_search.json"))
    assert_equal "Rue du Bois 3, 5530 Yvoir", Providers::Geocoder.build({}).search("10 rue Ecuyere Caen", region: france).first.label
  end

  test "on the European base, a number asks for an exact French house number only" do
    stub_request(:get, %r{data\.geopf\.fr}).to_return(ban_response(ban_feature("10 Rue Écuyère", type: "housenumber", score: 0.98)))
    results = Providers::Geocoder.build({}).search("10 rue Ecuyere Caen", region: europe)
    assert_equal [ "10 Rue Écuyère, 14000 Caen" ], results.map(&:label)
  end

  test "on the European base, a Belgian address never lands on a French namesake" do
    stub_request(:get, %r{data\.geopf\.fr}).to_return(ban_response(ban_feature("12 Route de la Gare", type: "housenumber", score: 0.47),
                                                                    ban_feature("Rue de la Gare", type: "street", score: 0.9)))
    nominatim = stub_request(:get, %r{nominatim}).to_return(json_response("nominatim_search.json"))
    results = Providers::Geocoder.build({}).search("12 rue de la Gare Ciney", region: europe)
    assert_requested nominatim
    assert_equal "Rue du Bois 3, 5530 Yvoir", results.first.label
  end

  test "on the European base, a query without a number does not ask the French base" do
    ban = stub_request(:get, %r{data\.geopf\.fr})
    stub_request(:get, %r{nominatim}).to_return(json_response("nominatim_search.json"))
    Providers::Geocoder.build({}).search("Yvoir", region: europe)
    assert_not_requested ban
  end
end
