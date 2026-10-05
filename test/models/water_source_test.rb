require "test_helper"

class WaterSourceTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @well = @map.water_sources.create!(name: "  Eau de puits ", potable: true)
  end

  def tap!(**properties)
    @map.features.create!(layer: "networks", kind: "tap", geometry: point, properties:)
  end

  test "names are squished, required and unique per map whatever the case" do
    assert_equal "Eau de puits", @well.name
    assert_not @map.water_sources.new(name: "eau de PUITS").valid?
    assert_not @map.water_sources.new(name: " ").valid?
    assert maps(:ahinvaux).water_sources.new(name: "Eau de pluie").valid?
  end

  test "new sources go to the end of the list" do
    rain = @map.water_sources.create!(name: "Eau de pluie")
    assert_equal [ "Eau de puits", "Eau de pluie" ], @map.water_sources.reload.map(&:name)
    assert_equal false, rain.potable
  end

  test "a linked tap takes the source's potability" do
    rain = @map.water_sources.create!(name: "Eau de pluie", potable: false)
    tap = tap!(water_source_id: rain.id.to_s)
    assert_equal [ rain.id, false ], tap.properties.values_at("water_source_id", "potable")
    assert_equal rain, tap.water_source
  end

  test "a tap cannot point to another map's source" do
    other = Map.create!(name: "Ailleurs", owner: users(:alice))
    foreign = other.water_sources.create!(name: "Réseau")
    tap = @map.features.new(layer: "networks", kind: "tap", geometry: point, properties: { "water_source_id" => foreign.id })
    assert_not tap.valid?
    assert_includes tap.errors.full_messages, "Cette source d'eau n'existe pas sur cette carte."
  end

  test "an empty link is dropped" do
    tap = tap!(water_source_id: "")
    assert_not tap.properties.key?("water_source_id")
  end

  test "changing a source's potability updates its taps" do
    tap = tap!(water_source_id: @well.id)
    other = tap!(potable: true)
    @well.update!(potable: false)
    assert_equal false, tap.reload.properties["potable"]
    assert_equal true, other.reload.properties["potable"]
    assert_equal 1, @well.as_json[:tapCount]
  end

  test "deleting a source unlinks its taps and keeps them" do
    tap = tap!(water_source_id: @well.id)
    @well.destroy!
    assert_not tap.reload.properties.key?("water_source_id")
    assert_equal true, tap.properties["potable"]
  end

  test "deleting the map deletes its sources" do
    tap!(water_source_id: @well.id)
    assert_difference -> { WaterSource.count }, -1 do
      @map.destroy!
    end
  end
end
