require "test_helper"

class Catalog::SpeciesMergeTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @target = plant_species(:apple)
    @source = PlantSpecies.create!(latin_name: "Malus domesticaa", review_status: "proposed", proposed_by: users(:michael), proposed_map: @map)
  end

  test "moves the palette, plants, patches and varieties to the target and keeps the name as a synonym" do
    twin = @source.varieties.create!(name: "Reinette")
    own = @source.varieties.create!(name: "Cox Orange")
    @target.varieties.create!(name: "reinette")
    @map.palette_items.create!(species: @source)
    @map.palette_items.create!(species: @source, variety: twin)
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.905, lat: 50.34),
                                  properties: { "species_id" => @source.id, "variety_id" => twin.id })
    patch = @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002))
    item = patch.patch_items.create!(map: @map, species: @source, count: 3)

    Catalog::SpeciesMerge.new(@source, @target).call

    assert_not PlantSpecies.exists?(@source.id)
    target_twin = @target.varieties.find_by(name: "reinette")
    assert_equal [ [ @target.id, nil ], [ @target.id, target_twin.id ] ].sort_by(&:to_s),
                 @map.palette_items.pluck(:species_id, :variety_id).sort_by(&:to_s)
    assert_equal @target.id, plant.reload.properties["species_id"]
    assert_equal target_twin.id, plant.properties["variety_id"]
    assert_equal @target, own.reload.species
    assert_equal @target.id, item.reload.species_id
    assert_includes @target.reload.common_names.select { _1.language == "la" }.map(&:name), "Malus domesticaa"
  end

  test "drops a palette entry the map already has for the target" do
    @map.palette_items.create!(species: @target)
    @map.palette_items.create!(species: @source)
    Catalog::SpeciesMerge.new(@source, @target).call
    assert_equal [ @target.id ], @map.palette_items.pluck(:species_id)
  end
end
