require "test_helper"

# The « Palette végétale » rows: palette, planned, planted and existing plants
# of a map in one table, with their quantities per tag.
class PlantPaletteTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @patch = @map.features.create!(layer: "plants", kind: "patch", name: "Lisière", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002),
                                   tags: [ "Chantier mars" ])
  end

  def plant!(species, tags: [], planted_on: nil, lng: 4.906)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng:, lat: 50.341), tags:,
                          properties: { "species_id" => species.id, "planted_on" => planted_on }.compact)
  end

  def row(palette, key) = palette.rows.find { |r| r[:key] == key }

  test "plant by plant: each point with its number, its species and its planting" do
    apple = plant!(plant_species(:apple), tags: [ "Verger" ], planted_on: "2015-01-01")
    apple.update!(properties: apple.properties.merge("planted_on_precision" => "year", "number" => 9))
    bare = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.907, lat: 50.341), properties: { "number" => 2 })

    plants = PlantPalette.new(@map).as_json[:plants]
    assert_equal [ bare.id, apple.id ], plants.map { _1[:id] }, "in the order of their numbers"
    line = plants.last
    assert_equal 9, line[:number]
    assert_equal "#{plant_species(:apple).id}-", line[:key]
    assert_equal "Pommier", line[:species]
    assert_equal "2015-01-01", line[:plantedOn]
    assert_equal "year", line[:plantedPrecision]
    assert_equal [ "Verger" ], line[:tags]
    assert_nil plants.first[:species]
    assert_nil plants.first[:plantedOn]
  end

  test "one row per species chosen, planned or growing, with the palette's choices" do
    PaletteItem.create!(map: @map, species: plant_species(:alder), role: "support", unit_price: 4.5, supplier: "Pépinière du Bocq", size: "60/80")
    plant!(plant_species(:apple), tags: [ "Chantier mars" ], planted_on: "2026-03-01")
    plant!(plant_species(:apple))
    PatchItem.create!(map_feature: @patch, map: @map, species: plant_species(:comfrey), count: 12)

    palette = PlantPalette.new(@map)
    alder = row(palette, "#{plant_species(:alder).id}-")
    assert alder[:inPalette]
    assert_equal 0, alder[:planned]
    assert_equal 4.5, alder[:unitPrice]
    assert_equal "Pépinière du Bocq", alder[:supplier]

    apple = row(palette, "#{plant_species(:apple).id}-")
    assert_not apple[:inPalette]
    assert_equal 2, apple[:planned]
    assert_equal 1, apple[:planted]
    assert_equal "2026-03-01", apple[:plantedFrom]
    assert_equal [ "Chantier mars" ], apple[:tags]
    assert apple[:maturityYears].positive?

    comfrey = row(palette, "#{plant_species(:comfrey).id}-")
    assert_equal 12, comfrey[:composed]
    assert_equal [ "Chantier mars" ], comfrey[:tags]
  end

  test "each catalogue row says how the species fits this land" do
    regions(:wallonia).update!(settings: { "climate" => { "hardiness_zone" => 7 } })
    @patch.update!(properties: { "exposure" => "shade" })
    plant!(plant_species(:apple))

    apple = row(PlantPalette.new(Map.find(@map.id)), "#{plant_species(:apple).id}-")
    statuses = apple[:fit][:criteria].to_h { |c| [ c[:key], c[:status] ] }
    assert_equal "fits", statuses["hardiness"]
    assert_equal "misfit", statuses["exposure"], "an apple tree wants sun, the patch is in shade"
    assert_equal "one_misfit", apple[:fit][:tier]
    assert_nil apple[:excludedBy]
  end

  test "quantities per tag, as the plant list filtered by that tag" do
    plant!(plant_species(:apple), tags: [ "Chantier mars" ])
    plant!(plant_species(:apple), tags: [ "Chantier novembre" ])
    plant!(plant_species(:apple))

    palette = PlantPalette.new(@map)
    apple = row(palette, "#{plant_species(:apple).id}-")
    assert_equal 3, apple[:planned]
    assert_equal 1, apple[:byTag]["Chantier mars"][:planned]
    assert_equal 1, apple[:byTag]["Chantier novembre"][:planned]
    assert_equal 1, apple[:untagged][:planned]
    assert_includes palette.tags, "Chantier novembre"
  end

  test "existing trees join their species' row when their name is a catalogue name, else get their own" do
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point, properties: { "species" => "pommier", "crown_diameter_m" => 7 })
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: 4.901), properties: { "species" => "Vieux chêne" })
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: 4.902), properties: { "species" => "Vieux chêne", "keep" => false })
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: 4.903), properties: { "species" => "Malus domestica", "health" => "dead" })

    palette = PlantPalette.new(@map)
    apple = row(palette, "#{plant_species(:apple).id}-")
    assert_equal 1, apple[:existing]
    assert_equal 0, apple[:planned]

    oak = row(palette, "existing:Vieux chêne")
    assert_equal 1, oak[:existing], "a tree to be felled is not part of the palette"
    assert_nil oak[:speciesId]
  end

  test "details: the plants on the map, their planting dates and latest observation, the patches holding the species" do
    planted = plant!(plant_species(:apple), planted_on: "2025-11-20")
    plant!(plant_species(:apple), lng: 4.907)
    PlantObservation.create!(map_feature: planted, observed_on: Date.new(2026, 5, 1), survival: "struggling", user: users(:michael))
    PatchItem.create!(map_feature: @patch, map: @map, species: plant_species(:apple), count: 3)

    details = PlantPalette.new(@map).details("#{plant_species(:apple).id}-")
    assert_equal 2, details[:plants].size
    first = details[:plants].find { |p| p[:id] == planted.id }
    assert_equal "2025-11-20", first[:plantedOn]
    assert_equal "struggling", first[:survival]
    assert_equal [ 3 ], details[:patches].map { |p| p[:quantity] }
    assert_nil PlantPalette.new(@map).details("nonsense")
  end
end
