require "test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/billing_test_helper"

class Relief::SectionTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper
  include BillingTestHelper

  setup do
    # About 71 m east–west and 111 m north–south.
    @map = Map.create!(name: "Coteau", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
    # South to north, through the middle: about 89 m.
    @line = [ [ @centre.x, @centre.y - 0.0004 ], [ @centre.x, @centre.y + 0.0004 ] ]
  end

  test "the ground follows the slope; plants within the band grow from today to year 30, ordered along the line" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    alder = @map.features.create!(layer: "plants", kind: "plant", name: "Aulne",
      geometry: { "type" => "Point", "coordinates" => [ @centre.x + 0.00003, @centre.y ] }, properties: { "species_id" => plant_species(:alder).id })
    apple = @map.features.create!(layer: "plants", kind: "plant",
      geometry: { "type" => "Point", "coordinates" => [ @centre.x - 0.00003, @centre.y - 0.0002 ] }, properties: { "species_id" => plant_species(:apple).id })
    # 40 m east: outside a 6 m band.
    @map.features.create!(layer: "plants", kind: "plant",
      geometry: { "type" => "Point", "coordinates" => [ @centre.x + 0.00056, @centre.y ] }, properties: { "species_id" => plant_species(:apple).id })

    data = Relief::Section.new(@map, line: @line).as_json
    assert_in_delta 89, data[:lengthM], 1
    assert_equal "terrain", data[:relief]
    assert_operator data[:ground].last[:z], :>, data[:ground].first[:z] + 7, "rises to the north"
    assert_equal [ apple.id, alder.id ], data[:plants].map { _1[:id] }
    plant = data[:plants].last
    assert_in_delta 44.5, plant[:d], 1
    assert_operator plant[:offset], :<, 0, "east of a line drawn northwards is on its right"
    heights = %w[today year5 year15 year30].map { plant[:sizes][_1][:h] }
    assert_equal heights.sort, heights, "it only grows"
    assert_operator heights.last, :>, heights.first * 3
    assert_equal %w[today year5 year15 year30], data[:moments].map { _1[:key] }
    assert_in_delta 0, data[:bearing], 1
  end

  test "what the line crosses is placed along it, networks never" do
    swale = @map.features.create!(layer: "water", kind: "swale", name: "Baissière",
      geometry: { "type" => "LineString", "coordinates" => [ [ @centre.x - 0.0003, @centre.y ], [ @centre.x + 0.0003, @centre.y ] ] }, properties: { "planned" => true })
    @map.features.create!(layer: "networks", kind: "water_pipe",
      geometry: { "type" => "LineString", "coordinates" => [ [ @centre.x - 0.0003, @centre.y + 0.0001 ], [ @centre.x + 0.0003, @centre.y + 0.0001 ] ] })

    data = Relief::Section.new(@map, line: @line).as_json
    assert_equal "flat", data[:relief]
    assert data[:ground].all? { _1[:z].nil? }
    crossing = data[:crossings].sole
    assert_equal [ swale.id, "Baissière" ], crossing.values_at(:id, :name)
    assert_in_delta 44.5, crossing[:from], 1
  end

  test "refuses a line too short or too long" do
    assert_equal :line, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ @line.first ]) }.key
    assert_equal :line, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ %w[a b], %w[c d] ]) }.key
    assert_equal :line, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ @line.first, [ "NaN", 50.3 ] ]) }.key
    assert_equal :line, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ @line.first, [ 4.9, 95 ] ]) }.key
    assert_equal :line, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ @line.first, @line.first ]) }.key
    assert_equal :too_long, assert_raises(Relief::Section::Error) { Relief::Section.new(@map, line: [ @line.first, [ @centre.x + 0.01, @centre.y ] ]) }.key
  end

  test "a plant past the end stays out, even when the last click is doubled" do
    @map.features.create!(layer: "plants", kind: "plant",
      geometry: { "type" => "Point", "coordinates" => [ @centre.x, @centre.y + 0.0006 ] }, properties: { "species_id" => plant_species(:apple).id })
    data = Relief::Section.new(@map, line: [ @line.first, @line.last, @line.last ]).as_json
    assert_empty data[:plants]
  end

  test "a line along a bed's edge still names the bed" do
    bed = @map.features.create!(layer: "structures", kind: "bed", name: "Potager",
      geometry: { "type" => "Polygon", "coordinates" => [ [ [ @centre.x, @centre.y ], [ @centre.x + 0.0001, @centre.y ], [ @centre.x + 0.0001, @centre.y + 0.0001 ], [ @centre.x, @centre.y + 0.0001 ], [ @centre.x, @centre.y ] ] ] })
    crossing = Relief::Section.new(@map, line: @line).as_json[:crossings].find { _1[:id] == bed.id }
    assert crossing, "the shared edge is a collection of a line and points"
    assert_in_delta 44.5, crossing[:from], 1
  end

  test "the relief is drawn on the free plan too" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    with_billing do
      assert_not Entitlements.for_map(@map).analyses?
      assert_equal "terrain", Relief::Section.new(@map, line: @line).as_json[:relief]
    end
  end
end
