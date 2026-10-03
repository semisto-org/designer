require "test_helper"

class Boundaries::FileImportTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def upload(name, content = nil, type: "application/octet-stream")
    if content
      file = Tempfile.new([ "upload", File.extname(name) ])
      file.write(content)
      file.rewind
      Rack::Test::UploadedFile.new(file.path, type, original_filename: name)
    else
      Rack::Test::UploadedFile.new(file_fixture(name), type)
    end
  end

  test "GeoJSON FeatureCollection: polygons only" do
    map = Boundaries::FileImport.new(@map, upload("terrain.geojson")).call.reload
    assert_equal 1, map.boundary.num_geometries
    assert_in_delta 7_915, map.area_m2, 100
  end

  test "KML: placemarks, holes and MultiGeometry merged" do
    map = Boundaries::FileImport.new(@map, upload("terrain.kml")).call.reload
    assert_equal 1, map.boundary.num_geometries
    polygon = map.boundary.geometry_n(0)
    assert_equal 1, polygon.num_interior_rings, "the hole is kept"
    assert_in_delta 15_830 - 316, map.area_m2, 200
  end

  test "GeoJSON in Lambert 72 is reprojected" do
    map = Boundaries::FileImport.new(@map, upload("terrain_lambert72.geojson")).call.reload
    assert_in_delta 10_000, map.area_m2, 50
    lng, lat = map.center.x, map.center.y
    assert lng.between?(4.5, 5.5) && lat.between?(50.0, 50.6), "lands in the Namur area (#{lng}, #{lat})"
  end

  test "coordinates in meters without a crs use the region's CRS, if it has one" do
    json = JSON.parse(file_fixture("terrain_lambert72.geojson").read).except("crs").to_json
    error = assert_raises(Boundaries::FileImport::Error) { Boundaries::FileImport.new(@map, upload("x.geojson", json)).call }
    assert_equal I18n.t("map_data.import.errors.projection"), error.message

    regions(:wallonia).update!(settings: { "crs" => "EPSG:31370" })
    map = Boundaries::FileImport.new(@map.reload, upload("x.geojson", json)).call.reload
    assert_in_delta 10_000, map.area_m2, 50
  end

  test "clear errors" do
    {
      "no polygon" => [ "a.geojson", { type: "Point", coordinates: [ 4.9, 50.3 ] }.to_json, :no_polygon ],
      "not json" => [ "a.geojson", "{oops", :invalid ],
      "broken kml" => [ "a.kml", "<kml><Polygon>", :invalid ],
      "outside" => [ "a.geojson", { type: "Polygon", coordinates: [ [ [ 2.30, 48.85 ], [ 2.31, 48.85 ], [ 2.31, 48.86 ], [ 2.30, 48.85 ] ] ] }.to_json, :outside_region ]
    }.each do |label, (name, content, key)|
      error = assert_raises(Boundaries::FileImport::Error, label) { Boundaries::FileImport.new(@map, upload(name, content)).call }
      assert_equal I18n.t("map_data.import.errors.#{key}"), error.message, label
    end
    error = assert_raises(Boundaries::FileImport::Error) { Boundaries::FileImport.new(@map, nil).call }
    assert_equal I18n.t("map_data.import.errors.missing"), error.message
  end
end
