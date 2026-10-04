require "test_helper"
require_relative "../../../test_helpers/claudy_import_test_helper"

class Imports::Claudy::ClientTest < ActiveSupport::TestCase
  include ClaudyImportTestHelper

  test "reads every page of the map features with the bearer key" do
    stub_claudy_api
    rows = claudy_client.each_map_feature.to_a
    assert_equal all_claudy_feature_rows.map { |row| row["id"] }, rows.map { |row| row["id"] }
    assert_requested :get, "#{CLAUDY_API}/map_features?page=2&per_page=200", times: 1
  end

  test "stops on an empty page even when meta promises more" do
    stub_claudy_listing("plants", [ { "data" => [], "meta" => { "page" => 1, "pages" => 9 } } ])
    assert_empty claudy_client.each_plant.to_a
  end

  test "adds /api/v1 to a bare host and reads the default from the environment" do
    assert_equal "https://claudy.example/api/v1", Imports::Claudy::Client.api_url("https://claudy.example/")
    assert_equal "https://claudy.example/api/v1", Imports::Claudy::Client.api_url("https://claudy.example/api/v1")
    with_env("CLAUDY_API_URL" => nil, "CLAUDY_API_KEY" => nil) do
      client = Imports::Claudy::Client.from_env
      assert_equal Imports::Claudy::Client::DEFAULT_URL, client.base_url
      assert_not client.configured?
    end
  end

  test "an unconfigured client says so in French" do
    error = assert_raises(Imports::Claudy::Error) { Imports::Claudy::Client.new(url: CLAUDY_HOST, key: "").each_plant.to_a }
    assert_match "CLAUDY_API_KEY", error.message
  end

  test "a refused key is a clear French error" do
    stub_request(:get, "#{CLAUDY_API}/map_features?page=1&per_page=200").to_return(status: 401, body: { error: "unauthorized" }.to_json)
    error = assert_raises(Imports::Claudy::Error) { claudy_client.each_map_feature.to_a }
    assert_match "Claudy refuse la clé (HTTP 401)", error.message
    assert_match "AGENT_API_TOKEN", error.message
  end

  test "retries a server error, then answers" do
    slept = []
    stub_request(:get, "#{CLAUDY_API}/plants?page=1&per_page=200")
      .to_return({ status: 503 }, { status: 200, body: { data: [ { "id" => 1, "type" => "plant" } ], meta: { pages: 1 } }.to_json })
    rows = claudy_client(sleeper: ->(seconds) { slept << seconds }).each_plant.to_a
    assert_equal [ 1 ], rows.map { |row| row["id"] }
    assert_equal [ 1 ], slept
  end

  test "gives up after the retries with an unavailable error" do
    stub_request(:get, "#{CLAUDY_API}/plants?page=1&per_page=200").to_timeout
    error = assert_raises(Imports::Claudy::Error) { claudy_client.each_plant.to_a }
    assert_match "Claudy ne répond pas comme prévu", error.message
    assert_requested :get, "#{CLAUDY_API}/plants?page=1&per_page=200", times: Imports::Claudy::Client::RETRIES + 1
  end

  test "a page that is not JSON is unreadable" do
    stub_request(:get, "#{CLAUDY_API}/plants?page=1&per_page=200").to_return(status: 200, body: "<html>maintenance</html>")
    error = assert_raises(Imports::Claudy::Error) { claudy_client.each_plant.to_a }
    assert_match "Réponse illisible", error.message
  end

  test "a record that vanished in Claudy has no detail" do
    stub_request(:get, "#{CLAUDY_API}/map_features/404").to_return(status: 404, body: { error: "not_found" }.to_json)
    assert_nil claudy_client.map_feature(404)
  end

  test "follows the storage redirect without sending the key to the storage host" do
    stub_claudy_photos
    file = claudy_client.download("#{CLAUDY_HOST}/rails/active_storage/blobs/redirect/eyJfcmFpbHMi/verger.jpg", max_bytes: 1.megabyte)
    assert_equal file_fixture("terrain.jpg").binread.b, file.body
    assert_equal "image/jpeg", file.content_type
    assert_equal "verger.jpg", file.filename
    assert_requested(:get, %r{claudy\.test/rails/active_storage}) { |request| request.headers["Authorization"] == "Bearer #{CLAUDY_KEY}" }
    assert_requested(:get, "https://storage.claudy.test/blobs/verger.jpg") { |request| request.headers["Authorization"].nil? }
  end

  test "refuses a file larger than allowed and an address that is not http" do
    stub_claudy_photos
    error = assert_raises(Imports::Claudy::Error) { claudy_client.download("https://storage.claudy.test/releve.png", max_bytes: 100) }
    assert_match "Photo trop lourde", error.message
    assert_raises(Imports::Claudy::Error) { claudy_client.download("file:///etc/passwd", max_bytes: 100) }
  end

  private
    def with_env(values)
      saved = values.keys.index_with { |key| ENV[key] }
      values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
      yield
    ensure
      saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    end
end
