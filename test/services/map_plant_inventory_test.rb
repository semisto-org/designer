require "test_helper"
require_relative "../test_helpers/plant_stubs"

class MapPlantInventoryTest < ActiveSupport::TestCase
  include PlantStubs

  setup { @map = maps(:ahinvaux) }

  def place(name: nil, **properties)
    @map.features.create!(layer: "plants", kind: "plant", name:, geometry: point, properties:)
  end

  test "an empty map has no plants" do
    inventory = MapPlantInventory.new(@map, palette: [])
    assert inventory.empty?
    assert_equal 0, inventory.total_quantity
  end

  test "palette items with their planned quantity, or what is placed if more" do
    apple = species(id: 7, latin_name: "Malus domestica", common_name: "Pommier")
    palette = [
      palette_item(id: 1, name: "Malus domestica", common_name: "Pommier", quantity: 10, plant_species: apple),
      palette_item(id: 2, name: "Corylus avellana", quantity: nil),
      palette_item(id: 3, name: "Rubus idaeus", quantity: 5, status: "discarded")
    ]
    3.times { place(paletteItemId: 2) }
    place(palette_item_id: "1")

    lines = MapPlantInventory.new(@map, palette:).lines
    assert_equal %w[palette-1 palette-2], lines.map(&:key)
    apple_line = lines.first
    assert_equal [ "Pommier", "Malus domestica", 10, 10, 1, 7 ], [ apple_line.name, apple_line.latin_name, apple_line.quantity, apple_line.planned_quantity, apple_line.placed_count, apple_line.species_id ]
    assert_equal apple, apple_line.species
    assert_equal 3, lines.second.quantity
    assert_equal "Corylus avellana", lines.second.display_name
  end

  test "placed plants outside the palette: grouped by species, then by name" do
    hazel = species(id: 9, latin_name: "Corylus avellana", common_name: "Noisetier")
    2.times { place(speciesId: 9) }
    place(name: "Figuier")
    place(name: "figuier")
    place # nothing to identify it: ignored

    lines = MapPlantInventory.new(@map, palette: [], species_lookup: ->(ids) { { 9 => hazel }.slice(*ids) }).lines
    assert_equal [ [ "species-9", "Noisetier", 2 ], [ "name-figuier", "Figuier", 2 ] ], lines.map { [ _1.key, _1.name, _1.quantity ] }
    assert_equal hazel, lines.first.species
  end

  test "rejected drafts are not counted" do
    @map.features.create!(layer: "plants", kind: "plant", name: "Noyer", geometry: point, status: "rejected")
    assert MapPlantInventory.new(@map, palette: []).empty?
  end
end
