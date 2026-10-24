require "test_helper"

class MapFeatureScenarioTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def feature!(layer, kind, properties = {}, geometry: square)
    @map.features.create!(layer:, kind:, geometry:, properties:)
  end

  test "what can be « En projet »: works on the land, a building or a wall of the existing layer, never a note or a plant" do
    assert MapFeature.plannable?("water", "pond")
    assert MapFeature.plannable?("structures", "greenhouse")
    assert MapFeature.plannable?("plants", "patch")
    assert MapFeature.plannable?("existing", "building")
    assert MapFeature.plannable?("existing", "wall")
    assert_not MapFeature.plannable?("existing", "existing_tree")
    assert_not MapFeature.plannable?("notes", "note_point")
    assert_not MapFeature.plannable?("plants", "plant")
    assert_not MapFeature.plannable?("bogus", "pond")
  end

  test "a planned building is a building, shed, greenhouse… carrying planned: true" do
    assert feature!("existing", "building", { "planned" => true }).planned_building?
    assert feature!("structures", "shed", { "planned" => true }).planned_building?
    assert_not feature!("existing", "building").planned_building?
    assert_not feature!("water", "pond", { "planned" => true }).planned_building?
  end

  test "planned and on_the_ground split the map like the editor does" do
    plant = feature!("plants", "plant", {}, geometry: point)
    planted = feature!("plants", "plant", { "planted_on" => "2025-11-20" }, geometry: point)
    house = feature!("existing", "building", { "planned" => true })
    barn = feature!("existing", "building")
    built = feature!("water", "pond", { "built_on" => "2026-04-01" })

    ids = [ plant, planted, house, barn, built ].map(&:id)
    assert_equal [ plant, house ].map(&:id).sort, @map.features.where(id: ids).planned.ids.sort
    assert_equal [ planted, barn, built ].map(&:id).sort, @map.features.where(id: ids).on_the_ground.ids.sort
  end
end
