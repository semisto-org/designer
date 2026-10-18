require "test_helper"

class MapFeatureTrashTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  test "a trashed element disappears from every scope and comes back whole" do
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "planted_on" => "2024-11-20" })
    harvest = plant.plant_harvests.create!(map: @map, user: users(:michael), noted_on: Date.new(2026, 8, 1), stage: "picked", quantity_kg: 2)
    number = plant.plant_number

    plant.trash!(by: users(:michael))
    assert_not @map.features.exists?(plant.id)
    assert_not MapFeature.exists?(plant.id)
    assert_includes @map.features.trashed, plant
    assert PlantHarvest.exists?(harvest.id), "the trash keeps what hangs off the element"

    plant.restore!
    assert @map.features.exists?(plant.id)
    assert_equal number, plant.reload.plant_number
  end

  test "a restored plant whose number was taken meanwhile takes the next free one" do
    @map.features.where(kind: "plant").delete_all
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "number" => 4 })
    plant.trash!
    other = @map.features.create!(layer: "plants", kind: "plant", geometry: point)
    assert_equal 5, other.plant_number, "a trashed plant's number is not handed out again"
    other.update!(properties: other.properties.merge("number" => 4))

    third = @map.features.create!(layer: "plants", kind: "plant", geometry: point)
    assert_equal 5, third.plant_number

    plant.restore!
    assert_equal 6, plant.reload.plant_number
  end

  test "pending AI changes of a trashed element are hidden until it comes back" do
    pond = map_features(:pond)
    @map.feature_update_drafts.create!(map_feature: pond, batch: "b1", rationale: "Plus profonde", proposed_changes: { "name" => "Grande mare" })
    assert_equal 1, @map.feature_update_drafts.pending.count
    pond.trash!
    assert_equal 0, @map.feature_update_drafts.pending.count
    pond.restore!
    assert_equal 1, @map.feature_update_drafts.pending.count
  end

  test "the purge erases elements trashed longer than the keeping time" do
    old = @map.features.create!(layer: "notes", kind: "zone", geometry: square)
    recent = @map.features.create!(layer: "notes", kind: "zone", geometry: square)
    old.trash!
    old.update_columns(deleted_at: 31.days.ago)
    recent.trash!

    MapFeature.purge_trash
    assert_not MapFeature.unscoped.exists?(old.id)
    assert MapFeature.unscoped.exists?(recent.id)
  end

  test "destroying a map takes its trash along" do
    map = Map.create!(name: "Essai", owner: users(:michael), region: @map.region)
    map.features.create!(layer: "notes", kind: "zone", geometry: square).trash!
    assert_difference -> { MapFeature.unscoped.count }, -1 do
      map.destroy!
    end
  end

  private
    def point = { "type" => "Point", "coordinates" => [ 4.905, 50.34 ] }
    def square = { "type" => "Polygon", "coordinates" => [ [ [ 4.9, 50.34 ], [ 4.901, 50.34 ], [ 4.901, 50.341 ], [ 4.9, 50.34 ] ] ] }
end
