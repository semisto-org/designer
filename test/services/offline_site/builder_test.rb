require "test_helper"
require_relative "../../test_helpers/offline_site_helper"
require_relative "../../test_helpers/soil_photos_helper"
require_relative "../../support/map_data_test_helper"

class OfflineSite::BuilderTest < ActiveSupport::TestCase
  include OfflineSiteHelper
  include SoilPhotosHelper
  include MapDataTestHelper

  PNG = Rails.root.join("test/fixtures/files/plant.png").binread

  setup do
    @map = maps(:ahinvaux)
    @map.update!(description: "Un verger-forêt au bord du bois.")
    @map.features.create!(layer: "networks", kind: "water_pipe", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] })
    @map.features.create!(layer: "water", kind: "swale", status: "draft", source: "ai", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.341 ], [ 4.906, 50.341 ] ] })
    @map.features.create!(layer: "notes", kind: "note_point", name: "Gel tardif ici", notes: "Le fond reste blanc jusqu'à 10 h.", geometry: point(lng: 4.906, lat: 50.3405))
    stub_request(:get, /.*/).to_return(status: 200, body: PNG, headers: { "Content-Type" => "image/png" })
    @budget = OfflineSite::Builder.tile_budget
    OfflineSite::Builder.tile_budget = 12
  end

  teardown { OfflineSite::Builder.tile_budget = @budget }

  def build(user: users(:michael), **options)
    with_fake_viewer do
      Tempfile.create([ "site", ".zip" ], binmode: true) do |file|
        builder = OfflineSite::Builder.new(@map, user:, **options)
        builder.write(file)
        return [ zip_entries(file), builder ]
      end
    end
  end

  test "packs the page, the viewer, the data and a readme in one folder" do
    entries, builder = build
    assert_equal "terranova-domaine-d-ahinvaux", builder.folder
    %w[index.html LISEZMOI.txt site/terranova.js site/terranova.css donnees/carte.js donnees/carte.geojson donnees/plantes.csv].each do |path|
      assert entries.key?(path), "#{path} is packed"
    end
    html = entries["index.html"]
    assert_includes html, "<title>Domaine d&#39;Ahinvaux</title>"
    assert_operator html.index("donnees/carte.js"), :<, html.index("site/terranova.js"), "the data loads before the viewer"
    assert_includes entries["LISEZMOI.txt"], "double-clique sur index.html"
    assert_equal "Plante;Nom latin;Quantité;Quantité prévue;Plants sur la carte", entries["donnees/plantes.csv"].lines.first.strip
  end

  test "the viewer gets the owner's own map: notes and names, the address, accepted features only, no networks" do
    data = offline_data(build.first)
    assert_equal "Domaine d'Ahinvaux", data["title"]
    assert_equal "Un verger-forêt au bord du bois.", data["description"]
    kinds = data["features"]["features"].map { |f| f["properties"]["kind"] }
    assert_includes kinds, "pond"
    assert_includes kinds, "note_point"
    assert_not_includes kinds, "water_pipe"
    assert_not_includes kinds, "swale", "an AI draft is not part of the map"
    note = data["features"]["features"].find { |f| f["properties"]["kind"] == "note_point" }
    assert_equal "Le fond reste blanc jusqu'à 10 h.", note["properties"]["notes"]
    assert_nil data["aerialView"]
    assert_nil data["reliefPath"]
    assert_equal false, data["offline"]["networks"]
    assert_equal "Michael", data["offline"]["exportedBy"].split.first
  end

  test "editors may take the networks along, and the readme warns about them" do
    entries, = build(include_networks: true)
    kinds = offline_data(entries)["features"]["features"].map { |f| f["properties"]["kind"] }
    assert_includes kinds, "water_pipe"
    assert_includes entries["LISEZMOI.txt"], "contient les réseaux"
    assert_includes entries["donnees/carte.geojson"], "water_pipe"
  end

  test "viewers never get the networks, even when asking" do
    entries, = build(user: users(:alice), include_networks: true)
    kinds = offline_data(entries)["features"]["features"].map { |f| f["properties"]["kind"] }
    assert_not_includes kinds, "water_pipe"
    assert_not_includes entries["donnees/carte.geojson"], "water_pipe"
  end

  test "the aerial photo and the cadastre around the terrain go along as tiles the viewer reads offline" do
    seed_wallonia_layers
    entries, builder = build
    data = offline_data(entries)
    assert_equal %w[ortho_2026 cadastre].sort, data["layers"].map { |l| l["key"] }.sort
    ortho = data["layers"].find { |l| l["key"] == "ortho_2026" }
    assert_equal "offline://ortho_2026/{z}/{x}/{y}", ortho["tiles"]
    script = entries.fetch("donnees/tuiles-ortho_2026.js")
    tiles = JSON.parse(script[/\["ortho_2026"\] = (.*);\n\z/m, 1])
    assert_operator tiles.size, :<=, 12
    assert_equal PNG, Base64.strict_decode64(tiles.values.first)
    assert_equal ortho["maxZoom"], tiles.keys.map(&:to_i).max
    assert_includes entries["index.html"], %(<script src="donnees/tuiles-ortho_2026.js"></script>)
    assert_operator builder.summary["tiles"], :>, 0
  end

  test "an unreachable provider leaves the plan on a neutral background" do
    seed_wallonia_layers
    stub_request(:get, /.*/).to_return(status: 503)
    entries, builder = build
    assert_empty offline_data(entries)["layers"]
    assert_equal 0, builder.summary["tiles"]
  end

  test "photos go as the app shows them, originals and videos to editors only; documents as they are" do
    photo = create_photo(caption: "Le verger en avril", taken_at: "2025-04-12T10:00:00")
    video = create_photo(file: "terrain.mp4", type: "video/mp4")
    document = @map.documents.new(uploaded_by: users(:michael), title: "Plan du géomètre")
    document.file.attach(io: StringIO.new("plan"), filename: "plan géomètre.txt", content_type: "text/plain")
    document.save!

    entries, builder = build
    offline = offline_data(entries)["offline"]
    shown = offline["photos"].find { |p| p["id"] == photo.id }
    assert_equal "photos/2025-04-12-#{photo.id}.jpg", shown["view"]
    assert_equal "Le verger en avril", shown["caption"]
    assert entries.key?(shown["view"])
    assert entries.key?(shown["file"]), "the original, for the owner"
    assert offline["photos"].any? { |p| p["id"] == video.id && entries.key?(p["file"]) }
    doc = offline["documents"].sole
    assert_equal "Plan du géomètre", doc["title"]
    assert_equal "plan", entries[doc["file"]]
    assert_equal({ "photos" => 1, "videos" => 1, "documents" => 1 }, builder.summary.slice("photos", "videos", "documents"))

    viewer_offline = offline_data(build(user: users(:alice)).first)["offline"]
    assert_equal [ photo.id ], viewer_offline["photos"].map { |p| p["id"] }
    assert_nil viewer_offline["photos"].sole["file"]
  end

  test "files beyond the size limit stay in Terranova and are listed" do
    document = @map.documents.new(uploaded_by: users(:michael), title: "Relevé lourd")
    document.file.attach(io: StringIO.new("x" * 100), filename: "releve.txt", content_type: "text/plain")
    document.save!
    OfflineSite::Builder.max_file_bytes = 10
    entries, = build
    assert_empty offline_data(entries)["offline"]["documents"]
    assert_equal [ "Relevé lourd" ], offline_data(entries)["offline"]["skipped"].map { |s| s["name"] }
    assert_includes entries["LISEZMOI.txt"], "Relevé lourd"
  ensure
    OfflineSite::Builder.max_file_bytes = 1.5.gigabytes
  end

  test "refuses to pack without the viewer" do
    previous = OfflineSite::Builder.viewer_dir
    OfflineSite::Builder.viewer_dir = Pathname.new(Dir.mktmpdir)
    assert_raises(OfflineSite::Builder::ViewerMissing) { OfflineSite::Builder.new(@map, user: users(:michael)).write(StringIO.new) }
  ensure
    OfflineSite::Builder.viewer_dir = previous
  end
end
