require "test_helper"

# What « Mes cartes » paints of each terrain.
class MapSketchTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
  end

  test "counts the palette per strata, the item's own strata winning over the species default" do
    PaletteItem.create!(map: @map, species: plant_species(:apple))
    PaletteItem.create!(map: @map, species: plant_species(:alder), strata: "sub_canopy")
    PaletteItem.create!(map: @map, species: plant_species(:comfrey), status: "draft", source: "ai")

    sketch = MapSketch.for([ @map ])[@map.id]
    assert_equal({ "sub_canopy" => 2 }, sketch[:palette])
  end

  test "lists plants with their strata and adult spread, water, hedges and existing trees" do
    PaletteItem.create!(map: @map, species: plant_species(:alder), strata: "sub_canopy")
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341), properties: { "species_id" => plant_species(:alder).id })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.907, lat: 50.341), properties: {})
    @map.features.create!(layer: "structures", kind: "hedge", geometry: line)
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: 4.908, lat: 50.342))
    @map.features.create!(layer: "notes", kind: "note_point", geometry: point(lng: 4.909, lat: 50.342))
    @map.features.create!(layer: "networks", kind: "water_pipe", geometry: line)
    @map.features.create!(layer: "water", kind: "swale", geometry: line, status: "draft", source: "ai")

    sketch = MapSketch.for([ @map ])[@map.id]
    alder, unknown = sketch[:plants].sort
    assert_equal [ 4.906, 50.341, "sub_canopy", 8.0 ], alder
    assert_equal "shrub", unknown[2]
    assert_equal [ "Polygon" ], sketch[:water].map { _1["type"] }  # the fixture pond; drafts are left out
    assert_equal [ "LineString" ], sketch[:hedges].map { _1["type"] }
    assert_equal [ [ 4.908, 50.342 ] ], sketch[:trees]
  end

  test "an empty map has an empty sketch, and no maps no query" do
    map = Map.create!(name: "Vide", owner: users(:bob))
    assert_equal({ palette: {}, plants: [], water: [], hedges: [], buildings: [], trees: [] }, MapSketch.for([ map ])[map.id])
    assert_equal({}, MapSketch.for([]))
  end

  private
    def point(lng:, lat:) = { "type" => "Point", "coordinates" => [ lng, lat ] }
    def line = { "type" => "LineString", "coordinates" => [ [ 4.904, 50.340 ], [ 4.906, 50.341 ] ] }
end
