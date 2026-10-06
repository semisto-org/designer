# Helpers for the Immich import tests: a stubbed Immich API (WebMock) shaped
# like Immich's own responses (albums, search/metadata, assets).
module ImmichImportTestHelper
  IMMICH_HOST = "https://photos.test".freeze
  IMMICH_API = "#{IMMICH_HOST}/api".freeze
  IMMICH_KEY = "immich-test-key".freeze
  IMMICH_ALBUM = "4b1f6a1e-0000-4000-8000-000000000001".freeze

  def immich_client(**options)
    Imports::Immich::Client.new(url: IMMICH_HOST, key: IMMICH_KEY, sleeper: ->(_) { }, **options)
  end

  def immich_asset(id, type: "IMAGE", mime: "image/jpeg", name: "#{id}.jpg", lat: 50.341, lng: 4.9075,
                   taken: "2025-04-12T09:15:00.000Z", description: "", size: 2_000)
    {
      "id" => id, "type" => type, "originalMimeType" => mime, "originalFileName" => name,
      "fileCreatedAt" => "2025-04-13T10:00:00.000Z",
      "exifInfo" => { "latitude" => lat, "longitude" => lng, "dateTimeOriginal" => taken, "description" => description, "fileSizeInByte" => size }
    }
  end

  def stub_immich_album(name: "📍 Ahinvaux — verger", id: IMMICH_ALBUM)
    stub_request(:get, "#{IMMICH_API}/albums/#{id}").with(headers: { "x-api-key" => IMMICH_KEY })
      .to_return(status: 200, body: { id:, albumName: name, assetCount: 0 }.to_json, headers: { "Content-Type" => "application/json" })
  end

  # One response per page, in order; each page but the last announces the next.
  def stub_immich_search(*pages, album: IMMICH_ALBUM)
    responses = pages.each_with_index.map do |items, index|
      next_page = index < pages.size - 1 ? (index + 2).to_s : nil
      { status: 200, body: { albums: {}, assets: { items:, count: items.size, nextPage: next_page } }.to_json,
        headers: { "Content-Type" => "application/json" } }
    end
    stub_request(:post, "#{IMMICH_API}/search/metadata")
      .with(headers: { "x-api-key" => IMMICH_KEY }) { |request| JSON.parse(request.body)["albumIds"] == [ album ] }
      .to_return(*responses)
  end

  def stub_immich_original(id, file: "terrain.jpg", type: "image/jpeg")
    stub_request(:get, "#{IMMICH_API}/assets/#{id}/original")
      .to_return(status: 200, body: file_fixture(file).binread, headers: { "Content-Type" => type })
  end

  def stub_immich_rendition(id, size:, file: "terrain.jpg", status: 200)
    stub_request(:get, "#{IMMICH_API}/assets/#{id}/thumbnail").with(query: { size: })
      .to_return(status:, body: status == 200 ? file_fixture(file).binread : "", headers: { "Content-Type" => "image/jpeg" })
  end
end
