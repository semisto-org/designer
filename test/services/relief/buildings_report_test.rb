require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../support/shapefile_test_helper"

class Relief::BuildingsReportTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include ShapefileTestHelper

  BASE = "https://urbisdownload.datastore.brussels/UrbIS/Vector/M8/UrbIS-Buildings3D/SHP".freeze

  setup do
    @map = maps(:ahinvaux)
    centre = @map.boundary.centroid
    @x, @y = wgs84_to_lambert(centre.x, centre.y)
  end

  test "where the region publishes its buildings in 3D: measured heights and roofs, nearest first" do
    region = @map.region
    region.update!(settings: region.settings.merge("buildings_3d" => { "provider" => "urbis", "attribution" => "© UrbIS" }))
    tile = format("%03d%03d", (@x / 1000).floor, (@y / 1000).floor)
    stub_request(:get, Providers::UrbisBuildings3d::DEFAULT_FEED)
      .to_return(status: 200, body: %(<link href="#{BASE}/UrbISBuildings3D_31370_SHP_#{tile}_20261003.zip"/>))
    # A house 30 m south of the place's centre: gutters at 6 m, ridge at 10 m.
    x, y = @x, @y - 30
    faces = [
      Face.new(id: 1, solid: 7, type: "GROUNDSURFACE", rings: [ [ [ x - 5, y - 4, 100 ], [ x + 5, y - 4, 100 ], [ x + 5, y + 4, 100 ], [ x - 5, y + 4, 100 ], [ x - 5, y - 4, 100 ] ] ]),
      Face.new(id: 2, solid: 7, type: "ROOFSURFACE", rings: [ [ [ x - 5, y - 4, 106 ], [ x + 5, y - 4, 106 ], [ x + 5, y, 110 ], [ x - 5, y, 110 ], [ x - 5, y - 4, 106 ] ] ]),
      Face.new(id: 3, solid: 7, type: "ROOFSURFACE", rings: [ [ [ x - 5, y, 110 ], [ x + 5, y, 110 ], [ x + 5, y + 4, 106 ], [ x - 5, y + 4, 106 ], [ x - 5, y, 110 ] ] ])
    ]
    stub_request(:get, "#{BASE}/UrbISBuildings3D_31370_SHP_#{tile}_20261003.zip").to_return(status: 200, body: urbis_tile_zip(tile, faces))

    report = Relief::BuildingsReport.new(@map).as_json
    assert report[:available]
    assert_equal "region_3d_model", report[:source]
    assert_equal "© UrbIS", report[:attribution]
    house = report[:nearest].first
    assert_equal 10.0, house[:height_m]
    assert_equal 6.0, house[:eaves_m]
    assert_equal "pitched", house[:roof]
    assert_equal "S", house[:direction]
    assert_in_delta 30, house[:distance_m], 1
  end

  test "elsewhere: OpenStreetMap's footprints with their tagged heights" do
    centre = @map.boundary.centroid
    ring = [ [ 0, 0 ], [ 0.0001, 0 ], [ 0.0001, 0.0001 ], [ 0, 0.0001 ], [ 0, 0 ] ].map { |dx, dy| { lon: centre.x + 0.0005 + dx, lat: centre.y + dy } }
    stub_request(:get, %r{\Ahttps://overpass-api\.de/api/interpreter})
      .to_return(status: 200, body: { elements: [ { type: "way", id: 9, tags: { building: "barn", height: "8" }, geometry: ring } ] }.to_json)

    report = Relief::BuildingsReport.new(@map).as_json
    assert_equal "openstreetmap", report[:source]
    barn = report[:nearest].first
    assert_equal({ source: "openstreetmap", kind: "barn", height_m: 8.0, direction: "E" }, barn.slice(:source, :kind, :height_m, :direction))
  end

  test "no boundary, no buildings" do
    @map.update_columns(boundary: nil)
    assert_equal({ available: false, reason: "no_boundary" }, Relief::BuildingsReport.new(@map.reload).as_json)
  end
end
