require "test_helper"

class WaterLinks::ReportTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @tank = @map.features.create!(layer: "water", kind: "water_tank", name: "IBC d'Eric",
                                  geometry: { "type" => "Point", "coordinates" => [ 4.95, 50.3 ] },
                                  properties: { "tank_type" => "ibc", "above_ground_m" => 2 })
    @link = @map.features.create!(layer: "water", kind: "irrigation_line",
                                  geometry: { "type" => "LineString", "coordinates" => [ [ 4.950012, 50.3 ], [ 4.951, 50.3 ] ] })
  end

  test "without the relief, only the tank's height gives the drop and the pressure" do
    report = WaterLinks::Report.new(@map, @link).as_json
    assert_equal({ id: @tank.id, kind: "water_tank", label: "IBC d'Eric", aboveGroundM: 2.0 }, report[:from])
    assert_nil report[:to]
    refute report[:relief]
    assert_equal 2.0, report[:dropM]
    assert_in_delta 0.2, report[:pressureBar], 0.01
  end

  test "with the relief, the slope adds to the tank's height" do
    heights = Struct.new(:values) { def at(lng, _lat) = lng < 4.9505 ? 120.0 : 117.0 }.new
    report = WaterLinks::Report.new(@map, @link)
    report.instance_variable_set(:@heights, heights)
    json = report.as_json
    assert json[:relief]
    assert_equal 3.0, json[:slopeDropM]
    assert_equal 5.0, json[:dropM]
    assert_in_delta 0.49, json[:pressureBar], 0.01
  end

  test "uphill, there is no pressure, only a negative drop" do
    heights = Struct.new(:values) { def at(lng, _lat) = lng < 4.9505 ? 100.0 : 110.0 }.new
    report = WaterLinks::Report.new(@map, @link)
    report.instance_variable_set(:@heights, heights)
    json = report.as_json
    assert_equal(-8.0, json[:dropM])
    assert_nil json[:pressureBar]
  end

  test "a tank lists the lines that leave it" do
    assert WaterLinks::Report.applies?(@tank, @map)
    links = WaterLinks::Report.new(@map, @tank).as_json[:links]
    assert_equal [ { id: @link.id, kind: "irrigation_line", label: MapElements.label("irrigation_line"), direction: "out", other: nil } ], links
  end

  test "a viewer's report leaves network lines out" do
    pipe = @map.features.create!(layer: "networks", kind: "water_pipe",
                                 geometry: { "type" => "LineString", "coordinates" => [ [ 4.95, 50.300012 ], [ 4.95, 50.301 ] ] })
    assert_equal @tank.id, pipe.properties["from_id"]
    ids = WaterLinks::Report.new(@map, @tank, editor: false).as_json[:links].map { _1[:id] }
    assert_equal [ @link.id ], ids
  end
end

class Relief::HeightsTest < ActiveSupport::TestCase
  test "the ground's height is the mean of the known nodes around a point" do
    terrain = Struct.new(:west, :north, :step, :cols, :rows, :nodata, :z_min, :z_unit, :cell_size_m).new(0.0, 30.0, 10.0, 3, 3, 65535, 100.0, 0.01, 10.0)
    raw = [ 0, 100, 200, 300, 400, 65535, 600, 700, 800 ]
    heights = Relief::Heights.new(terrain, heights: raw)
    lng, lat = Relief::Mercator.inverse(10.0, 20.0)
    assert_in_delta 104.0, heights.at(lng, lat), 0.001, "10 m cells: the node itself"
    fine = terrain.dup.tap { _1.cell_size_m = 1.0 }
    assert_in_delta 103.875, Relief::Heights.new(fine, heights: raw).at(lng, lat), 0.001, "1 m cells: the known nodes around"
    lng, lat = Relief::Mercator.inverse(500.0, 20.0)
    assert_nil heights.at(lng, lat)
  end
end
