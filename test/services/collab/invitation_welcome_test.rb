require "test_helper"

class Collab::InvitationWelcomeTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def plant(planted_on: nil)
    props = { "species_name" => "Pommier" }
    props["planted_on"] = planted_on if planted_on
    @map.features.create!(layer: "plants", kind: "plant", status: "active", properties: props,
      geometry: RGeo::Geographic.spherical_factory(srid: 4326).point(4.9, 50.3))
  end

  test "counts the plants in the ground and those still to come, never the drafts" do
    @map.features.where(layer: "plants").delete_all
    plant(planted_on: "2026-03-01")
    plant
    plant.update!(status: "draft")
    json = Collab::InvitationWelcome.new(@map, inviter: users(:michael), role: "viewer", chat: false).as_json
    assert_equal 2, json[:plants]
    assert_equal 1, json[:plantsInGround]
    assert_equal users(:michael).display_name, json[:inviterName]
    assert_equal @map.name, json[:mapName]
    assert_not json.key?(:address)
  end
end
