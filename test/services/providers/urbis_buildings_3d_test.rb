require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../support/shapefile_test_helper"

class Providers::UrbisBuildings3dTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include ShapefileTestHelper

  FEED = Providers::UrbisBuildings3d::DEFAULT_FEED
  BASE = "https://urbisdownload.datastore.brussels/UrbIS/Vector/M8/UrbIS-Buildings3D".freeze
  # Around a garden of Woluwe-Saint-Pierre, inside the Lambert tile 154169.
  BOX = { south: 50.8330, west: 4.4290, north: 50.8350, east: 4.4320 }.freeze

  setup do
    @x, @y = wgs84_to_lambert(4.4305, 50.8340).map(&:round)
  end

  def feed_xml(*editions)
    links = editions.map do |format, tile, date|
      %(<link rel="section" href="#{BASE}/#{format}/UrbISBuildings3D_31370_#{format}_#{tile}_#{date}.zip" type="application/x-zip" sectionID="#{tile}"/>)
    end
    %(<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>#{links.join}</entry></feed>)
  end

  # A house with a gable roof (gutters 5 m, ridge 8 m above its ground at
  # 50 m), a wall, a flat shed next to it and a building far away.
  def faces
    x, y = @x, @y
    ground = ->(x0, y0, x1, y1, z) { [ [ x0, y0, z ], [ x1, y0, z ], [ x1, y1, z ], [ x0, y1, z ], [ x0, y0, z ] ] }
    [
      Face.new(id: 1, solid: 10, type: "GROUNDSURFACE", rings: [ ground.(x - 5, y - 4, x + 5, y + 4, 50.0) ]),
      Face.new(id: 2, solid: 10, type: "ROOFSURFACE", rings: [ [ [ x - 5, y - 4, 55 ], [ x + 5, y - 4, 55 ], [ x + 5, y, 58 ], [ x - 5, y, 58 ], [ x - 5, y - 4, 55 ] ] ]),
      Face.new(id: 3, solid: 10, type: "ROOFSURFACE", rings: [ [ [ x - 5, y, 58 ], [ x + 5, y, 58 ], [ x + 5, y + 4, 55 ], [ x - 5, y + 4, 55 ], [ x - 5, y, 58 ] ] ]),
      Face.new(id: 4, solid: 10, type: "WALLSURFACE", rings: [ [ [ x - 5, y - 4, 50 ], [ x + 5, y - 4, 50 ], [ x + 5, y - 4, 55 ], [ x - 5, y - 4, 55 ], [ x - 5, y - 4, 50 ] ] ]),
      Face.new(id: 5, solid: 11, type: "GROUNDSURFACE", rings: [ ground.(x + 8, y - 2, x + 11, y + 2, 49.5) ]),
      # A roof with a hole (a light well).
      Face.new(id: 6, solid: 11, type: "ROOFSURFACE", rings: [ ground.(x + 8, y - 2, x + 11, y + 2, 52.0), ground.(x + 9, y - 1, x + 10, y + 1, 52.0).reverse ]),
      Face.new(id: 7, solid: 12, type: "GROUNDSURFACE", rings: [ ground.(x + 400, y + 400, x + 410, y + 410, 60.0) ]),
      Face.new(id: 8, solid: 12, type: "ROOFSURFACE", rings: [ ground.(x + 400, y + 400, x + 410, y + 410, 70.0) ])
    ]
  end

  test "the real buildings of the extent, roofs above their ground, in WGS84" do
    stub_request(:get, FEED).to_return(status: 200, body: feed_xml(
      [ "SHP", "154169", "20260905" ], [ "DWG", "154169", "20261003" ], [ "SHP", "154169", "20261003" ], [ "SHP", "155169", "20261003" ]
    ))
    tile = stub_request(:get, "#{BASE}/SHP/UrbISBuildings3D_31370_SHP_154169_20261003.zip").to_return(status: 200, body: urbis_tile_zip("154169", faces))

    with_memory_cache do
      models = Providers::UrbisBuildings3d.new.within(**BOX)
      assert_equal %w[urbis-10 urbis-11], models.map(&:id), "the far building is left out"

      house, shed = models
      assert_equal 8.0, house.height
      corner = house.rings.first.first
      expected = lambert_to_wgs84(@x - 5, @y - 4)
      assert_in_delta expected[0], corner[0], 2e-7
      assert_in_delta expected[1], corner[1], 2e-7
      assert_equal 2, house.roofs.size, "two slopes, no wall"
      assert_equal [ 5.0, 5.0, 8.0, 8.0, 5.0 ], house.roofs.first.first.map(&:last)
      assert_equal 2, shed.roofs.first.size, "the light well stays a hole"
      assert_equal 2.5, shed.height

      Providers::UrbisBuildings3d.new.within(**BOX)
      assert_requested tile, times: 1
    end
  end

  test "outside the region's tiles: no model; a district: refused; a dead feed: unavailable" do
    stub_request(:get, FEED).to_return(status: 200, body: feed_xml([ "SHP", "150170", "20261003" ]))
    assert_empty Providers::UrbisBuildings3d.new.within(**BOX)

    assert_raises(Providers::BuildingModels::Unavailable) do
      Providers::UrbisBuildings3d.new.within(south: 50.80, west: 4.38, north: 50.86, east: 4.48)
    end

    stub_request(:get, FEED).to_return(status: 503)
    assert_raises(Providers::UrbisBuildings3d::Unavailable) { Providers::UrbisBuildings3d.new.within(**BOX) }
  end

  test "a broken tile is unavailable, not an empty place" do
    stub_request(:get, FEED).to_return(status: 200, body: feed_xml([ "SHP", "154169", "20261003" ]))
    stub_request(:get, %r{SHP_154169_20261003\.zip}).to_return(status: 200, body: "not a zip")
    assert_raises(Providers::UrbisBuildings3d::Unavailable) { Providers::UrbisBuildings3d.new.within(**BOX) }
  end

  test "chosen per region in its settings" do
    brussels = Region.new(key: "brussels", settings: { "buildings_3d" => { "provider" => "urbis", "attribution" => "© UrbIS" } })
    models = Providers::BuildingModels.for(brussels, {})
    assert_kind_of Providers::UrbisBuildings3d, models
    assert_equal "© UrbIS", models.attribution
    assert_nil Providers::BuildingModels.for(brussels, { "BUILDING_MODELS" => "none" })
    assert_nil Providers::BuildingModels.for(regions(:wallonia), {})
    assert_nil Providers::BuildingModels.for(nil, {})
  end
end
