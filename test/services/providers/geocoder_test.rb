require "test_helper"
require_relative "../../support/map_data_test_helper"

class Providers::GeocoderTest < ActiveSupport::TestCase
  include MapDataTestHelper

  test "nominatim by default, restricted to the region, with a contact" do
    stub = stub_request(:get, %r{\Ahttps://nominatim\.openstreetmap\.org/search})
      .with(query: hash_including("q" => "Rue du Bois 3 Yvoir", "format" => "jsonv2", "countrycodes" => "be",
                                  "viewbox" => "2.84,49.49,6.41,50.82", "bounded" => "1", "email" => "carto@example.org"),
            headers: { "User-Agent" => /SemistoDesigner.*carto@example\.org/ })
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

  test "can be switched off" do
    geocoder = Providers::Geocoder.build("GEOCODER_PROVIDER" => "none")
    assert_not geocoder.available?
    assert_raises(Providers::Geocoder::Unavailable) { geocoder.search("Yvoir") }
  end

  test "short queries do not call the provider; failures raise Unavailable" do
    geocoder = Providers::Geocoder.build({})
    assert_empty geocoder.search("ab")
    stub_request(:get, %r{nominatim}).to_timeout
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
end
