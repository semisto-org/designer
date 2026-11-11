require "test_helper"

# A pipe, ditch or swale knows what it connects: its ends snap to the tank,
# pond or roof they are drawn on, and the person can change them.
class WaterLinksTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @tank = @map.features.create!(layer: "water", kind: "water_tank", geometry: { "type" => "Point", "coordinates" => [ 4.95, 50.3 ] },
                                  properties: { "tank_type" => "ibc", "above_ground_m" => 2 })
    @bed = @map.features.create!(layer: "structures", kind: "raised_bed", geometry: square(4.9505, 50.2998))
  end

  def line(*coordinates) = { "type" => "LineString", "coordinates" => coordinates }

  # About 1 m east of the tank, then into the raised bed.
  def pipe(**attrs)
    @map.features.create!(layer: "water", kind: "irrigation_line", geometry: line([ 4.950012, 50.3 ], [ 4.95052, 50.29985 ]), **attrs)
  end

  def square(lng, lat, size: 0.0001)
    { "type" => "Polygon", "coordinates" => [ [ [ lng, lat ], [ lng + size, lat ], [ lng + size, lat + size ], [ lng, lat + size ], [ lng, lat ] ] ] }
  end

  test "the library marks the lines that carry water" do
    assert_equal %w[irrigation_line overflow_pipe swale ditch water_pipe].sort, MapElements.link_kinds.sort
  end

  test "the ends of a new line snap to the elements they are drawn on" do
    link = pipe
    assert_equal @tank.id, link.properties["from_id"]
    assert_equal @bed.id, link.properties["to_id"]
  end

  test "an end drawn away from everything stays loose" do
    link = @map.features.create!(layer: "water", kind: "ditch", geometry: line([ 4.96, 50.31 ], [ 4.961, 50.311 ]))
    refute link.properties.key?("from_id")
    refute link.properties.key?("to_id")
  end

  test "the person's choice wins, until the line is reshaped" do
    link = pipe
    pond = @map.features.create!(layer: "water", kind: "pond", geometry: square(4.97, 50.32))
    link.update!(properties: link.properties.merge("to_id" => pond.id))
    assert_equal pond.id, link.reload.properties["to_id"]

    link.update!(name: "Goutte-à-goutte")
    assert_equal pond.id, link.reload.properties["to_id"], "a save that does not move the line keeps the choice"

    link.update!(geometry: line([ 4.950012, 50.3 ], [ 4.95055, 50.29986 ]))
    assert_equal @bed.id, link.reload.properties["to_id"], "reshaped, its ends are read again"
  end

  test "a blank end means connected to nothing" do
    link = pipe
    link.update!(properties: link.properties.merge("from_id" => nil))
    refute link.reload.properties.key?("from_id")
  end

  test "an end must be an element of the same map, never another line nor itself" do
    other = maps(:ahinvaux).features.where.not(id: [ @tank.id, @bed.id ]).first
    outsider = MapFeature.where.not(map_id: @map.id).first
    link = pipe
    if outsider
      link.properties = link.properties.merge("to_id" => outsider.id)
      refute link.valid?
    end
    link.properties = link.properties.merge("to_id" => link.id)
    refute link.valid?
    ditch = @map.features.create!(layer: "water", kind: "ditch", geometry: line([ 4.96, 50.31 ], [ 4.961, 50.311 ]))
    link.properties = link.properties.merge("to_id" => ditch.id)
    refute link.valid?
    assert other
  end

  test "an AI draft snaps to a draft tank proposed before it" do
    tank = @map.features.create!(layer: "water", kind: "water_tank", status: "draft", source: "ai",
                                 geometry: { "type" => "Point", "coordinates" => [ 4.98, 50.33 ] })
    link = @map.features.create!(layer: "water", kind: "overflow_pipe", status: "draft", source: "ai",
                                 geometry: line([ 4.98, 50.33 ], [ 4.981, 50.331 ]))
    assert_equal tank.id, link.properties["from_id"]
  end

  test "a tank takes its height above ground" do
    assert_equal 2, @tank.properties["above_ground_m"]
    @tank.properties = @tank.properties.merge("above_ground_m" => 50)
    refute @tank.valid?
  end
end
