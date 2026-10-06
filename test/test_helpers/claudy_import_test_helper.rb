# Helpers for the Claudy import tests: a stubbed Claudy API (WebMock) built
# from the invented fixtures in test/fixtures/files/claudy, modelled on
# Claudy's API v1 views (api/v1/map_features, api/v1/plants).
module ClaudyImportTestHelper
  CLAUDY_HOST = "https://claudy.test".freeze
  CLAUDY_API = "#{CLAUDY_HOST}/api/v1".freeze
  CLAUDY_KEY = "claudy-test-token".freeze
  CLAUDY_FIXTURES = Rails.root.join("test/fixtures/files/claudy")

  def claudy_json(path) = JSON.parse(CLAUDY_FIXTURES.join(path).read)

  def claudy_client(**options)
    Imports::Claudy::Client.new(url: CLAUDY_HOST, key: CLAUDY_KEY, sleeper: ->(_) { }, **options)
  end

  def claudy_api_source = Imports::Claudy::ApiSource.new(claudy_client)

  # The listings (two pages of features, one of plants), every detail
  # endpoint (the row plus notes_log, photos and tasks from details.json)
  # and the photo files behind their URLs. `features` / `plants` replace the
  # rows (one page each) to test changes upstream.
  def stub_claudy_api(features: nil, plants: nil)
    feature_pages = features ? [ page(features, 1, 1) ] : [ claudy_json("api/map_features_page1.json"), claudy_json("api/map_features_page2.json") ]
    plant_pages = plants ? [ page(plants, 1, 1) ] : [ claudy_json("api/plants_page1.json") ]
    stub_claudy_listing("map_features", feature_pages)
    stub_claudy_listing("plants", plant_pages)
    details = claudy_json("api/details.json")
    stub_claudy_details("map_features", feature_pages.flat_map { |p| p["data"] }, details["map_features"])
    stub_claudy_details("plants", plant_pages.flat_map { |p| p["data"] }, details["plants"])
    stub_claudy_photos
  end

  def stub_claudy_listing(path, pages)
    pages.each_with_index do |body, index|
      stub_request(:get, "#{CLAUDY_API}/#{path}")
        .with(query: { "page" => (index + 1).to_s, "per_page" => "200" }, headers: { "Authorization" => "Bearer #{CLAUDY_KEY}" })
        .to_return(status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" })
    end
  end

  def stub_claudy_details(path, rows, details)
    by_id = rows.index_by { |row| row["id"].to_s }
    stub_request(:get, %r{\A#{Regexp.escape(CLAUDY_API)}/#{path}/\d+\z}).to_return do |request|
      id = request.uri.path.split("/").last
      row = by_id[id]
      if row
        detail = { "notes_log" => [], "photos" => [], "tasks" => [] }.merge(details.fetch(id, {}))
        { status: 200, body: { data: row.merge(detail) }.to_json, headers: { "Content-Type" => "application/json" } }
      else
        { status: 404, body: { error: "not_found" }.to_json }
      end
    end
  end

  # Photo 31: an Active Storage redirect on Claudy's host to the storage
  # service; photo 33: straight on the storage host.
  def stub_claudy_photos
    stub_request(:get, %r{\A#{Regexp.escape(CLAUDY_HOST)}/rails/active_storage/blobs/redirect/eyJfcmFpbHMi/verger\.jpg\z})
      .to_return(status: 302, headers: { "Location" => "https://storage.claudy.test/blobs/verger.jpg" })
    stub_request(:get, "https://storage.claudy.test/blobs/verger.jpg")
      .to_return(status: 200, body: file_fixture("terrain.jpg").binread, headers: { "Content-Type" => "image/jpeg" })
    stub_request(:get, "#{CLAUDY_HOST}/rails/active_storage/blobs/redirect/eyJfcmFpbHMj/IMG_0001.HEIC")
      .to_return(status: 200, body: file_fixture("terrain_gps.heic").binread, headers: { "Content-Type" => "image/heic" })
    stub_request(:get, "https://storage.claudy.test/releve.png")
      .to_return(status: 200, body: file_fixture("terrain.png").binread, headers: { "Content-Type" => "image/png" })
  end

  def claudy_rows(path) = claudy_json(path)["data"]

  def all_claudy_feature_rows
    claudy_rows("api/map_features_page1.json") + claudy_rows("api/map_features_page2.json")
  end

  def claudy_import(map, source: claudy_api_source, **options)
    Imports::Claudy::Importer.new(map:, source:, **options).call
  end

  def imported(map, type, id)
    map.features.where("properties -> 'import' ->> 'type' = ? AND properties -> 'import' ->> 'id' = ?", type, id.to_s).sole
  end

  private
    def page(rows, number, pages)
      { "data" => rows, "meta" => { "page" => number, "per_page" => 200, "total" => rows.size, "pages" => pages } }
    end
end
