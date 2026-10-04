require "test_helper"
require_relative "../../../test_helpers/claudy_import_test_helper"

class Imports::Claudy::FileSourceTest < ActiveSupport::TestCase
  include ClaudyImportTestHelper

  setup { @map = maps(:ahinvaux) }

  def source(path) = Imports::Claudy::FileSource.new(CLAUDY_FIXTURES.join(path))

  test "imports the Claudy export without network: declared networks, sketches and photo files" do
    report = claudy_import(@map, source: source("export/claudy-map.json"))

    assert_equal "water", imported(@map, "map_feature", 120).properties["network"]
    assert_equal "electric_line", imported(@map, "map_feature", 130).kind
    assert_equal [ "point", "Citerne" ], imported(@map, "map_feature", 121).then { |f| [ f.kind, f.name ] }

    sketch = imported(@map, "sketch", 3)
    assert_equal [ "notes", "sketch", "Idées pour la mare", "Printemps" ], [ sketch.layer, sketch.kind, sketch.name, sketch.properties["folder"] ]
    assert_equal 2, sketch.geometry.num_geometries
    assert_in_delta 4.9087, sketch.geometry.geometry_n(0).start_point.x
    assert_equal 1, report.skipped[:empty_sketch]

    photo = @map.photos.sole
    assert_equal imported(@map, "map_feature", 110), photo.map_feature
    assert_equal file_fixture("terrain.jpg").binread.b, photo.image.download.b
    assert_not_requested :get, %r{app\.example}
    assert_match "Source : fichier #{CLAUDY_FIXTURES.join('export/claudy-map.json')}", report.to_s
    assert_no_match "Les notes manuscrites", report.to_s

    second = claudy_import(@map, source: source("export/claudy-map.json"))
    assert_equal 0, second.total(:created) + second.total(:updated)
    assert_equal 1, second.photos[:known]
  end

  test "reads a GeoJSON of Claudy's map and falls back when a shape does not fit its kind" do
    report = claudy_import(@map, source: source("map.geojson"))

    assert_equal "ethernet_line", imported(@map, "map_feature", 140).kind
    assert_equal [ "existing", "zone" ], imported(@map, "map_feature", 110).then { |f| [ f.layer, f.kind ] }
    pond = imported(@map, "map_feature", 175)
    assert_equal [ "water", "zone", "MultiPolygon" ], [ pond.layer, pond.kind, pond.geometry.geometry_type.type_name ]
    assert_match "« Mare double » (Claudy map_feature n° 175) ne convient pas à « #{MapElements.label('pond')} »", report.warnings.sole
    apple = imported(@map, "plant", 7)
    assert_equal plant_species(:apple).id, apple.properties["species_id"], "found by its only French name"
    assert_nil apple.properties["unmatched_species"]
    assert_equal 1, report.skipped[:welcome_map]
    assert_match "Les notes manuscrites : ce fichier ne les contient pas", report.to_s
    assert_match "Photos : aucune.", report.to_s
  end

  test "reads a saved API response" do
    features = source("api/map_features_page2.json")
    assert_equal claudy_rows("api/map_features_page2.json").map { |row| row["id"] }, features.map_features.map { |row| row["id"] }
    assert_nil features.sketches
    plants = source("api/plants_page1.json")
    assert_equal [ 7, 8, 9, 10, 11, 12, 13 ], plants.plants.map { |row| row["id"] }
  end

  test "says clearly when the file is missing, unreadable or of another kind" do
    assert_match "Fichier introuvable", assert_raises(Imports::Claudy::Error) { source("nope.json") }.message
    Dir.mktmpdir do |dir|
      File.write("#{dir}/broken.json", "{ not json")
      assert_match "Fichier illisible", assert_raises(Imports::Claudy::Error) { Imports::Claudy::FileSource.new("#{dir}/broken.json") }.message
      File.write("#{dir}/other.json", { "hello" => "world" }.to_json)
      assert_match "Format inconnu", assert_raises(Imports::Claudy::Error) { Imports::Claudy::FileSource.new("#{dir}/other.json") }.message
    end
  end

  test "never reads a photo file outside the export folder" do
    export = source("export/claudy-map.json")
    error = assert_raises(Imports::Claudy::Error) { export.photo_file({ "path" => "../map.geojson" }, max_bytes: 1.megabyte) }
    assert_match "Fichier de photo introuvable", error.message
    assert_raises(Imports::Claudy::Error) { export.photo_file({ "path" => "/etc/hostname" }, max_bytes: 1.megabyte) }
    assert_equal "image/jpeg", export.photo_file({ "path" => "photos/41.jpg" }, max_bytes: 1.megabyte).content_type
  end
end
