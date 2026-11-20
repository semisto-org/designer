require "test_helper"
require_relative "../../test_helpers/observed_climate_test_helper"

class Maps::WindsControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  include ObservedClimateTestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  test "requires a role on the map" do
    sign_in_as users(:bob)
    get map_wind_path(@map), as: :json
    assert_response :not_found
  end

  test "off without a CDS key" do
    sign_in_as users(:alice)
    get map_wind_path(@map), as: :json
    assert_equal({ "available" => false, "reason" => "not_configured" }, response.parsed_body)
  end

  test "the roses of the map's cell, the person's wind signs and the wind sectors" do
    lat, lng = Providers::Era5Land.cell(50.341, 4.9075)
    rose = { "year" => { "prevailing_deg" => 247.5, "sectors" => [] }, "seasons" => {}, "cold_spring" => { "prevailing_deg" => 45.0 }, "strong" => {}, "hours" => 10, "directions" => 16 }
    ObservedClimate.create!(cell_lat: lat, cell_lng: lng, first_year: 1995, last_year: 2024, status: "ready", computed_at: Time.current,
                            indicators: { "years" => 30, "months" => [], "wind" => rose })
    sign = @map.features.create!(layer: "notes", kind: "season_sign", geometry: point(lng: 4.906, lat: 50.34),
                                 properties: { "sign" => "wind_exposed", "wind_from_deg" => 252.4, "observed_at" => "2026-11-12" })
    @map.features.create!(layer: "notes", kind: "season_sign", geometry: point(lng: 4.906, lat: 50.34), properties: { "sign" => "puddle" })
    sector = @map.features.create!(layer: "notes", kind: "sector", properties: { "sector_type" => "cold_wind", "sector_season" => "spring", "from_deg" => 20, "to_deg" => 100 },
                                   geometry: { "type" => "LineString", "coordinates" => [ [ 4.90, 50.33 ], [ 4.91, 50.33 ] ] })

    sign_in_as users(:alice)
    with_cds_key do
      assert_no_enqueued_jobs { get map_wind_path(@map), as: :json }
    end
    json = response.parsed_body
    assert_equal "ready", json["status"]
    assert_equal 247.5, json["rose"]["year"]["prevailingDeg"]
    assert_not json["rose"].key?("hours")
    assert_equal({ "gridKm" => 9, "windGridKm" => 31 }, json["scale"])
    assert_equal [ [ sign.id, 252 ] ], json["signs"].map { [ _1["id"], _1["windFromDeg"] ] }
    assert_equal [ [ sector.id, "cold_wind", "spring" ] ], json["sectors"].map { [ _1["id"], _1["type"], _1["season"] ] }
  end

  test "the shelter of a tree" do
    tree = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.905, lat: 50.34), properties: { "species_id" => plant_species(:apple).id })
    @map.features.create!(layer: "notes", kind: "sector", properties: { "sector_type" => "wind", "from_deg" => 225, "to_deg" => 315 },
                          geometry: { "type" => "LineString", "coordinates" => [ [ 4.90, 50.33 ], [ 4.91, 50.33 ] ] })
    sign_in_as users(:alice)
    get shelter_map_wind_path(@map, feature_id: tree.id), as: :json
    assert_response :success
    wind = response.parsed_body["shelter"]["winds"].sole
    assert_equal [ "wind", 225.0, 315.0, "sector", nil ], wind.values_at("type", "fromDeg", "toDeg", "source", "shelter")
  end
end
