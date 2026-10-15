require "test_helper"

class MapFeaturePlantNumberTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @map.features.where(kind: "plant").delete_all
  end

  def plant!(**attrs)
    @map.features.create!(layer: "plants", kind: "plant", status: "active", geometry: point(lng: 4.906, lat: 50.341), **attrs)
  end

  test "a new plant takes the next free number of its map" do
    assert_equal 1, plant!.plant_number
    assert_equal 2, plant!.plant_number
  end

  test "a forced number is kept, and the next plant follows the highest one" do
    assert_equal 40, plant!(properties: { "number" => "40" }).plant_number
    assert_equal 41, plant!.plant_number
  end

  test "a number held by another plant of the map is refused" do
    plant!(properties: { "number" => 7 })
    feature = @map.features.new(layer: "plants", kind: "plant", geometry: point, properties: { "number" => 7 })
    assert_not feature.valid?
    assert_match(/numéro 7/, feature.errors.full_messages.to_sentence)
  end

  test "an update without the number keeps the plant's number" do
    feature = plant!(properties: { "number" => 12 })
    feature.update!(properties: { "planted_on" => Date.current.iso8601 })
    assert_equal 12, feature.reload.plant_number
  end

  test "other elements carry no number" do
    feature = @map.features.create!(layer: "notes", kind: "note", geometry: point)
    assert_nil feature.properties["number"]
  end
end
