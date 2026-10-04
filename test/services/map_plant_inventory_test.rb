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

  test "only active plants are counted, not drafts or rejected ones" do
    @map.features.create!(layer: "plants", kind: "plant", name: "Noyer", geometry: point, status: "rejected")
    @map.features.create!(layer: "plants", kind: "plant", name: "Noyer", geometry: point, status: "draft")
    assert MapPlantInventory.new(@map, palette: []).empty?
  end

  Slot = Struct.new(:planned, :placed)
  Item = Struct.new(:id, :species_id, :variety_id, :target_count, :display_name, :species, :variety, keyword_init: true) do
    def key = [ species_id, variety_id ]
  end
  Variety = Struct.new(:id, :common_name, :full_latin_name, keyword_init: true)
  Quantities = Struct.new(:palette, :by_key, :species_index, :variety_index, keyword_init: true)

  test "the plants area's planted quantities are used as they are" do
    apple = species(id: 7, latin_name: "Malus domestica", common_name: "Pommier")
    hazel = species(id: 9, latin_name: "Corylus avellana", common_name: "Noisetier")
    elder = species(id: 11, latin_name: "Sambucus nigra", common_name: "Sureau")
    reinette = Variety.new(id: 3, common_name: nil, full_latin_name: "Malus domestica 'Reinette'")
    quantities = Quantities.new(
      palette: [
        Item.new(id: 1, species_id: 7, target_count: 10, display_name: "Pommier", species: apple),
        Item.new(id: 2, species_id: 9, target_count: 40, display_name: "Noisetier", species: hazel)
      ],
      by_key: {
        [ 7, nil ] => Slot.new(24, 6),  # planned in patches and as points
        [ 7, 3 ] => Slot.new(2, 2),     # a cultivar placed without being in the palette
        [ 11, nil ] => Slot.new(0, 0)   # nothing left: skipped
      },
      species_index: { 7 => apple, 9 => hazel, 11 => elder },
      variety_index: { 3 => reinette }
    )

    lines = MapPlantInventory.new(@map, quantities:).lines
    assert_equal %w[palette-1 palette-2 variety-3], lines.map(&:key)
    assert_equal [ 24, 24, 6, 1, 7 ], lines.first.to_h.values_at(:quantity, :planned_quantity, :placed_count, :palette_item_id, :species_id)
    assert_equal [ "Noisetier", 40, 40, 0 ], lines.second.to_h.values_at(:name, :quantity, :planned_quantity, :placed_count)
    assert_equal [ "Pommier", "Malus domestica 'Reinette'", 2, apple ], lines.third.to_h.values_at(:name, :latin_name, :quantity, :species)
  end

  test "the map's own planted quantities are read when the plants area provides them" do
    hazel = species(id: 9, latin_name: "Corylus avellana", common_name: "Noisetier")
    quantities = Quantities.new(palette: [], by_key: { [ 9, nil ] => Slot.new(15, 3) }, species_index: { 9 => hazel }, variety_index: {})
    @map.define_singleton_method(:planted_quantities) { quantities }
    place(name: "Ignored when quantities exist")

    assert_equal [ [ "species-9", "Noisetier", 15 ] ], MapPlantInventory.new(@map).lines.map { [ _1.key, _1.name, _1.quantity ] }
  end
end
