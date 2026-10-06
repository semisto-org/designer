require "test_helper"
require_relative "../../../test_helpers/immich_import_test_helper"

class Imports::Immich::ImporterTest < ActiveSupport::TestCase
  include ImmichImportTestHelper

  setup do
    @map = maps(:ahinvaux)
    stub_immich_album
  end

  def import(**options)
    Imports::Immich::Importer.new(map: @map, client: immich_client, album_id: IMMICH_ALBUM, **options).call
  end

  test "imports the album's images placed, dated and filed in an album named after it" do
    stub_immich_search([ immich_asset("x1", description: "Le verger en avril", name: "IMG_0001.JPG"), immich_asset("v1", type: "VIDEO") ])
    stub_immich_original("x1")

    result = import
    assert_equal 1, result.counts[:created]
    assert_equal 1, result.counts[:video]
    photo = @map.photos.last
    assert_equal "import", photo.source
    assert_equal "exif", photo.location_source
    assert_in_delta 4.9075, photo.lng, 1e-6
    assert_in_delta 50.341, photo.lat, 1e-6
    assert_equal Time.utc(2025, 4, 12, 9, 15), photo.taken_at
    assert_equal "Le verger en avril", photo.caption
    assert_equal "IMG_0001.jpg", photo.image.filename.to_s
    assert_equal "Ahinvaux — verger", photo.album.name
    assert ImportRecord.exists?(map: @map, source: "immich", external_id: "x1", record: photo)
  end

  test "a second run adds nothing and reuses the album" do
    stub_request(:post, "#{IMMICH_API}/search/metadata")
      .to_return(status: 200, body: { assets: { items: [ immich_asset("x1") ], nextPage: nil } }.to_json)
    stub_immich_original("x1")
    import
    assert_no_difference -> { MapPhoto.count + PhotoAlbum.count } do
      assert_equal 1, import.counts[:known]
    end
  end

  test "a file already on the map is counted, not added twice" do
    stub_immich_search([ immich_asset("x1"), immich_asset("x2") ])
    stub_immich_original("x1")
    stub_immich_original("x2")
    result = import
    assert_equal 1, result.counts[:created]
    assert_equal 1, result.counts[:duplicate]
    assert ImportRecord.exists?(map: @map, source: "immich", external_id: "x2", record_id: nil)
  end

  test "a HEIC photo comes as Immich's JPEG rendition, the preview when there is no full size" do
    stub_immich_search([ immich_asset("h1", mime: "image/heic", name: "IMG_0002.HEIC") ])
    stub_immich_rendition("h1", size: "fullsize", status: 404)
    stub_immich_rendition("h1", size: "preview")

    assert_equal 1, import.counts[:created]
    photo = @map.photos.last
    assert_equal "IMG_0002.jpg", photo.image.filename.to_s
    assert_equal "image/jpeg", photo.image.content_type
    assert_equal "exif", photo.location_source
    assert_not_requested :get, "#{IMMICH_API}/assets/h1/original"
  end

  test "a photo without position waits to be placed" do
    stub_immich_search([ immich_asset("x1", lat: nil, lng: nil) ])
    stub_immich_original("x1")
    result = import
    assert_equal 0, result.located
    assert_nil @map.photos.last.location
  end

  test "a dry run counts without downloading or writing" do
    stub_immich_search([ immich_asset("x1") ])
    assert_no_difference -> { MapPhoto.count + PhotoAlbum.count + ImportRecord.count } do
      assert_equal 1, import(dry_run: true).counts[:planned]
    end
    assert_not_requested :get, "#{IMMICH_API}/assets/x1/original"
  end

  test "one failing download is reported, the others go on" do
    stub_immich_search([ immich_asset("x1"), immich_asset("x2") ])
    stub_request(:get, "#{IMMICH_API}/assets/x1/original").to_return(status: 404)
    stub_immich_rendition("x1", size: "fullsize", status: 404)
    stub_immich_rendition("x1", size: "preview", status: 404)
    stub_immich_original("x2")
    result = import
    assert_equal 1, result.counts[:failed]
    assert_equal 1, result.counts[:created]
    assert_match "x1.jpg", result.warnings.first
    assert_match "1 photo(s) ajoutée(s)", I18n.with_locale(:fr) { Imports::Immich::Summary.new(result).to_s }
  end

  test "suggests the maps whose outline holds the album's photos" do
    inside = immich_asset("x1")
    outside = immich_asset("x2", lat: 48.85, lng: 2.35)
    assert_equal [ [ @map, 1 ] ], Imports::Immich::Importer.suggest_maps([ inside, outside, immich_asset("x3", lat: nil) ])
  end
end
