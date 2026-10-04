require "test_helper"
require_relative "../../test_helpers/plantnet_test_helper"

class Providers::PlantNetTest < ActiveSupport::TestCase
  include PlantnetTestHelper

  setup { @plantnet = Providers::PlantNet.new(api_key: "cle-test") }

  test "sends the photos as multipart and reads the candidates, most probable first" do
    stub = stub_request(:post, PLANTNET_ENDPOINT)
      .with(query: hash_including("api-key" => "cle-test", "lang" => "fr", "nb-results" => "5"))
      .to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: default_plantnet_body)

    candidates = @plantnet.identify([ plantnet_image("feuille.jpg"), plantnet_image("fleur.jpg", content_type: "image/png") ])

    assert_requested stub
    assert_requested(:post, PLANTNET_ENDPOINT) do |request|
      request.headers["Content-Type"].start_with?("multipart/form-data; boundary=") &&
        request.body.include?('name="images"; filename="feuille.jpg"') &&
        request.body.include?('name="images"; filename="fleur.jpg"') &&
        request.body.include?("Content-Type: image/png") &&
        request.body.include?("image-bytes") &&
        request.body.scan(%(name="organs"\r\n\r\nauto)).size == 2
    end
    assert_equal [ "Malus domestica", "Quercus robur" ], candidates.map(&:latin_name)
    assert_equal [ 0.83, 0.07 ], candidates.map(&:score)
    apple = candidates.first
    assert_equal "(Suckow) Borkh.", apple.authorship
    assert_equal [ "Pommier", "Pommier domestique" ], apple.common_names
    assert_equal [ "Malus", "Rosaceae", "3001509" ], [ apple.genus, apple.family, apple.gbif_id ]
    assert_empty candidates.last.common_names
  end

  test "keeps the five best candidates, sorted by score" do
    results = (1..7).map { |i| plantnet_result("Genus species#{i}", i / 10.0) }
    stub_plantnet(body: plantnet_body(*results))

    candidates = @plantnet.identify([ plantnet_image ])

    assert_equal 5, candidates.size
    assert_equal [ 0.7, 0.6, 0.5, 0.4, 0.3 ], candidates.map(&:score)
    assert_equal "Genus species7", candidates.first.latin_name
  end

  test "skips results without a species name and clamps scores" do
    stub_plantnet(body: { results: [ { score: 1.7, species: { scientificNameWithoutAuthor: "Malus domestica" } }, { score: 0.5, species: {} }, { score: 0.4 } ] }.to_json)

    candidates = @plantnet.identify([ plantnet_image ])

    assert_equal [ "Malus domestica" ], candidates.map(&:latin_name)
    assert_equal 1.0, candidates.first.score
  end

  test "answers an empty list when Pl@ntNet sees no plant (404)" do
    stub_plantnet(status: 404, body: { message: "Species not found" }.to_json)
    assert_equal [], @plantnet.identify([ plantnet_image ])
  end

  test "an error status raises Unavailable, quota apart" do
    stub_plantnet(status: 401, body: "Invalid api key")
    error = assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }
    assert_equal :upstream, error.reason
    assert_match "401", error.message
    assert_not_includes error.message, "cle-test"

    stub_plantnet(status: 429, body: "Too many requests")
    assert_equal :quota, assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }.reason

    stub_plantnet(status: 500, body: "boom")
    assert_equal :upstream, assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }.reason
  end

  test "a timeout or a refused connection raises Unavailable" do
    stub_request(:post, PLANTNET_ENDPOINT).to_timeout
    assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }

    stub_request(:post, PLANTNET_ENDPOINT).to_raise(Errno::ECONNREFUSED)
    assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }
  end

  test "an unreadable or unexpected body raises Unavailable" do
    stub_plantnet(body: "<html>oops</html>")
    assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }

    stub_plantnet(body: { results: "nope" }.to_json)
    assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }

    stub_plantnet(body: [ 1, 2 ].to_json)
    assert_raises(Providers::PlantNet::Unavailable) { @plantnet.identify([ plantnet_image ]) }
  end

  test "without a key it is not configured and never calls out" do
    plantnet = Providers::PlantNet.new(api_key: nil)
    assert_not plantnet.configured?
    assert_raises(Providers::PlantNet::NotConfigured) { plantnet.identify([ plantnet_image ]) }
    assert_not_requested :any, //
  end

  test "reads the key from PLANTNET_API_KEY" do
    assert_not Providers::PlantNet.configured?
    with_plantnet_key("from-env") do
      assert Providers::PlantNet.configured?
      assert Providers::PlantNet.new.configured?
    end
    assert_not Providers::PlantNet.configured?
    with_plantnet_key("") { assert_not Providers::PlantNet.configured? }
  end

  test "refuses no image and more than five images without calling out" do
    assert_raises(Providers::PlantNet::InvalidRequest) { @plantnet.identify([]) }
    error = assert_raises(Providers::PlantNet::InvalidRequest) { @plantnet.identify([ plantnet_image ] * 6) }
    assert_match "5 images", error.message
    assert_not_requested :any, //
  end

  test "five images are fine" do
    stub = stub_plantnet
    @plantnet.identify([ plantnet_image ] * 5)
    assert_requested stub
  end

  test "the API URL can be overridden" do
    stub = stub_request(:post, %r{\Ahttps://plantnet\.example\.org/v2/identify/all}).to_return(status: 200, body: default_plantnet_body)
    Providers::PlantNet.new(api_key: "k", url: "https://plantnet.example.org/").identify([ plantnet_image ])
    assert_requested stub
  end

  test "a filename cannot break out of the multipart header" do
    stub_plantnet
    @plantnet.identify([ plantnet_image("a\"b\r\nX-Evil: 1.jpg") ])
    assert_requested(:post, PLANTNET_ENDPOINT) do |request|
      request.body.include?('filename="a_b__X-Evil: 1.jpg"') && !request.body.include?("\r\nX-Evil")
    end
  end
end
