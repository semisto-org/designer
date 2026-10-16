require "test_helper"

class MapFeatureSoilDestinationTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def pond!(properties = {})
    @map.features.create!(layer: "water", kind: "pond", geometry: square(size: 0.0001), properties: { "depth_m" => 1 }.merge(properties))
  end

  def mound!
    @map.features.create!(layer: "structures", kind: "mound", geometry: square(lng: 4.907, size: 0.0001), properties: { "height_m" => 0.8 })
  end

  test "the soil goes to another feature of the map or to a known place" do
    mound = mound!
    pond = pond!("topsoil_to" => mound.id, "subsoil_to" => "removed")
    assert_equal mound.id, pond.properties["topsoil_to"]
    assert_equal "removed", pond.properties["subsoil_to"]

    pond.update!(properties: pond.properties.merge("topsoil_to" => mound.id.to_s, "subsoil_to" => ""))
    assert_equal mound.id, pond.reload.properties["topsoil_to"]
    assert_not pond.properties.key?("subsoil_to")
  end

  test "an unknown place, or the hole itself, is refused" do
    pond = @map.features.new(layer: "water", kind: "pond", geometry: square(size: 0.0001), properties: { "depth_m" => 1, "subsoil_to" => "moon" })
    assert_not pond.valid?
    assert_match(/destination de la terre/, pond.errors.full_messages.to_sentence)

    pond = pond!
    pond.properties = pond.properties.merge("topsoil_to" => pond.id)
    assert_not pond.valid?
  end

  test "a feature of another map, or one deleted since, is dropped instead of blocking the save" do
    elsewhere = Map.create!(name: "Ailleurs", owner: users(:bob), region: regions(:wallonia)).features.create!(layer: "structures", kind: "mound", geometry: square(size: 0.0001), properties: { "height_m" => 1 })
    assert_not pond!("topsoil_to" => elsewhere.id).properties.key?("topsoil_to")

    mound = mound!
    pond = pond!("topsoil_to" => mound.id)
    mound.destroy!
    pond.update!(name: "Mare du bas")
    assert_not pond.reload.properties.key?("topsoil_to")
  end

  test "topsoil depth and « déjà creusé » are checked" do
    assert pond!("topsoil_cm" => 30, "dug" => true).valid?
    assert_not @map.features.new(layer: "water", kind: "pond", geometry: square(size: 0.0001), properties: { "topsoil_cm" => 150 }).valid?
    assert_not @map.features.new(layer: "water", kind: "pond", geometry: square(size: 0.0001), properties: { "dug" => "oui" }).valid?
  end

  test "a new swale sends its soil to its berm, and paths can be sunk" do
    assert_equal "berm", MapElements.defaults_for("swale")["topsoil_to"]
    path = @map.features.new(layer: "access", kind: "path", geometry: { type: "LineString", coordinates: [ [ 4.906, 50.341 ], [ 4.907, 50.341 ] ] },
      properties: { "width_m" => 1.2, "dug_depth_m" => 0.6 })
    assert path.valid?, path.errors.full_messages.to_sentence
    path.properties["dug_depth_m"] = 4
    assert_not path.valid?
  end
end
