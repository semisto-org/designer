require "test_helper"
require_relative "../../support/map_data_test_helper"

class Boundaries::ParcelUnionTest < ActiveSupport::TestCase
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    @map = maps(:ahinvaux)
  end

  def stub_parcels
    stub_request(:get, %r{CADMAP_PARCELLES/MapServer/identify}).with(query: hash_including("geometry" => "4.9055,50.3405"))
      .to_return(json_response("identify_cadastre.json"))
    stub_request(:get, %r{CADMAP_PARCELLES/MapServer/identify}).with(query: hash_including("geometry" => "4.9065,50.3405"))
      .to_return(json_response("identify_cadastre_neighbour.json"))
  end

  test "two adjacent parcels become one polygon; CAPAKEYs are stored" do
    stub_parcels
    parcels = [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 }, { capakey: "92142B0248/00_000", lng: 4.9065, lat: 50.3405 } ]
    map = Boundaries::ParcelUnion.new(@map, parcels).call.reload

    assert_equal %w[92142B0247/00X009 92142B0248/00_000], map.parcels
    assert_equal 1, map.boundary.num_geometries, "shared edge merged"
    bbox = map.bbox
    [ 4.905, 50.340, 4.907, 50.341 ].zip(bbox).each { |expected, actual| assert_in_delta expected, actual, 1e-6 }
    # 0.002° × 0.001° at 50.34° N ≈ 142 m × 111 m
    assert_in_delta 15_830, map.area_m2, 200
  end

  test "a parcel that no longer matches its CAPAKEY is refused" do
    stub_parcels
    error = assert_raises(Boundaries::ParcelUnion::Error) do
      Boundaries::ParcelUnion.new(@map, [ { capakey: "92142B9999/00_000", lng: 4.9055, lat: 50.3405 } ]).call
    end
    assert_match "92142B9999/00_000", error.message
  end

  test "input checks and unreachable cadastre" do
    assert_raises(Boundaries::ParcelUnion::Error) { Boundaries::ParcelUnion.new(@map, []).call }
    assert_raises(Boundaries::ParcelUnion::Error) { Boundaries::ParcelUnion.new(@map, [ { capakey: "x", lng: "a", lat: 1 } ]).call }
    stub_request(:get, SPW_REST).to_timeout
    error = assert_raises(Boundaries::ParcelUnion::Error) do
      Boundaries::ParcelUnion.new(@map, [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ]).call
    end
    assert_equal I18n.t("map_data.parcels.errors.unreachable"), error.message
    assert_raises(Boundaries::ParcelUnion::Error) { Boundaries::ParcelUnion.new(@map, [ { capakey: "x", lng: 1, lat: 1 } ], cadastre: nil).call }
  end
end
