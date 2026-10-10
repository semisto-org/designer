require "test_helper"
require_relative "../../../test_helpers/immich_import_test_helper"

class Imports::Immich::ClientTest < ActiveSupport::TestCase
  include ImmichImportTestHelper

  test "adds /api to a bare host and is not configured without a key" do
    assert_equal "https://photos.test/api", Imports::Immich::Client.api_url("https://photos.test/")
    assert_equal "https://photos.test/api", Imports::Immich::Client.api_url("https://photos.test/api")
    assert_not Imports::Immich::Client.new(url: IMMICH_HOST, key: " ").configured?
    assert_not Imports::Immich::Client.new(url: "", key: "key").configured?
  end

  test "lists own and shared albums once each, with the API key" do
    album = { id: "a1", albumName: "Verger" }
    stub_request(:get, "#{IMMICH_API}/albums").with(headers: { "x-api-key" => IMMICH_KEY })
      .to_return(status: 200, body: [ album ].to_json)
    stub_request(:get, "#{IMMICH_API}/albums?shared=true")
      .to_return(status: 200, body: [ album, { id: "a2", albumName: "Mare" } ].to_json)
    assert_equal %w[a1 a2], immich_client.albums.map { |row| row["id"] }
  end

  test "follows the pages of an album's assets" do
    stub_immich_search([ immich_asset("x1") ], [ immich_asset("x2") ])
    assert_equal %w[x1 x2], immich_client.each_album_asset(IMMICH_ALBUM).map { |asset| asset["id"] }
    assert_requested(:post, "#{IMMICH_API}/search/metadata", times: 2)
    assert_requested(:post, "#{IMMICH_API}/search/metadata") { |request| JSON.parse(request.body) == { "albumIds" => [ IMMICH_ALBUM ], "withExif" => true, "size" => 1000, "page" => 2 } }
  end

  test "follows a cursor on recent Immich versions" do
    stub_request(:post, "#{IMMICH_API}/search/metadata").to_return(
      { status: 200, body: { assets: { items: [ immich_asset("x1") ], nextCursor: "abc", nextPage: nil } }.to_json },
      { status: 200, body: { assets: { items: [ immich_asset("x2") ], nextCursor: nil, nextPage: nil } }.to_json }
    )
    assert_equal %w[x1 x2], immich_client.each_album_asset(IMMICH_ALBUM).map { |asset| asset["id"] }
    assert_requested(:post, "#{IMMICH_API}/search/metadata") { |request| JSON.parse(request.body)["cursor"] == "abc" }
  end

  test "a refused key is a clear French error" do
    stub_request(:get, "#{IMMICH_API}/albums/#{IMMICH_ALBUM}").to_return(status: 401, body: "{}")
    error = assert_raises(Imports::Immich::Error) { immich_client.album(IMMICH_ALBUM) }
    assert_match "Immich refuse la clé (HTTP 401)", error.message
  end

  test "retries a server error, then gives up with an unavailable error" do
    stub_request(:get, "#{IMMICH_API}/albums/#{IMMICH_ALBUM}").to_return(status: 503)
    error = assert_raises(Imports::Immich::Error) { immich_client.album(IMMICH_ALBUM) }
    assert_match "Immich ne répond pas comme prévu", error.message
    assert_requested(:get, "#{IMMICH_API}/albums/#{IMMICH_ALBUM}", times: 3)
  end

  test "downloads the original and refuses a file over the limit" do
    stub_immich_original("x1")
    file = immich_client.original("x1", max_bytes: 25.megabytes)
    assert_equal "image/jpeg", file.content_type
    assert_equal file_fixture("terrain.jpg").binread.b, file.body
    assert_raises(Imports::Immich::Error) { immich_client.original("x1", max_bytes: 10) }
  end

  test "a missing rendition is NotFound" do
    stub_immich_rendition("x1", size: "fullsize", status: 404)
    assert_raises(Imports::Immich::Client::NotFound) { immich_client.rendition("x1", size: "fullsize", max_bytes: 1.megabyte) }
  end
end
