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

  test "the refusal names its reason for the client" do
    plant!(properties: { "number" => 7 })
    feature = @map.features.new(layer: "plants", kind: "plant", geometry: point, properties: { "number" => 7 })
    assert_not feature.valid?
    assert_equal [ :number_taken ], feature.errors.details[:base].map { _1[:error] }
  end

  test "a swap gives the other plant the number this one leaves" do
    seven = plant!(properties: { "number" => 7 })
    twelve = plant!(properties: { "number" => 12 })
    twelve.update!(properties: twelve.properties.merge("number" => 7), swap_number: true)
    assert_equal 7, twelve.reload.plant_number
    assert_equal 12, seven.reload.plant_number
    assert_equal seven, twelve.swapped_with
    assert_equal 1, seven.lock_version, "the other plant's open copies must reload"
  end

  test "a swap onto a free number moves the plant alone" do
    feature = plant!(properties: { "number" => 3 })
    feature.update!(properties: feature.properties.merge("number" => 30), swap_number: true)
    assert_equal 30, feature.reload.plant_number
    assert_nil feature.swapped_with
  end

  test "a new plant that takes a held number sends the holder to the next free one" do
    plant!(properties: { "number" => 1 })
    plant!(properties: { "number" => 2 })
    feature = plant!(properties: { "number" => 1 }, swap_number: true)
    assert_equal 1, feature.plant_number
    assert_equal 3, feature.swapped_with.reload.plant_number
  end

  test "a rejected draft does not hold its number" do
    plant!(properties: { "number" => 5 }, status: "rejected")
    assert plant!(properties: { "number" => 5 }).persisted?
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
