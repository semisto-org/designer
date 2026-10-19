require "test_helper"
require "test_helpers/drone_pilots_test_helper"

class DronePilotsControllerTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @pilot = create_pilot(users(:bob))
  end

  test "the directory shows listed pilots with the price for my map, never their legal details" do
    create_pilot(users(:alice), status: "pending")
    sign_in_as users(:michael)
    get drone_pilots_path(map_id: @map.id), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ @pilot.id ], props["pilots"].map { _1["id"] }
    card = props["pilots"].sole
    assert card["serves"]
    assert_equal 70_00, card.dig("quote", "commissionCents")
    refute card.key?("taxNumber")
    refute_includes response.body, "83.02.01"
    assert_equal @map.id, props["mapId"]
  end

  test "a pilot's page lists my maps with their quote, and the request goes to the pilot" do
    sign_in_as users(:michael)
    get drone_pilot_path(@pilot), headers: inertia_headers
    assert response.parsed_body.dig("props", "maps").sole["serves"]

    assert_enqueued_emails 1 do
      post drone_missions_path, params: { drone_mission: { drone_pilot_id: @pilot.id, map_id: @map.id, data_types: %w[orthophoto thermal], desired_period: "février", message: "Bonjour" } }
    end
    mission = DroneMission.last
    assert_redirected_to drone_mission_path(mission)
    assert_equal %w[orthophoto thermal], mission.data_types
  end

  test "a request the pilot cannot serve comes back with the reason" do
    @pilot.update!(service_radius_km: 5)
    sign_in_as users(:michael)
    post drone_missions_path, params: { drone_mission: { drone_pilot_id: @pilot.id, map_id: @map.id, data_types: %w[orthophoto], message: "Bonjour" } }
    assert_equal 0, DroneMission.count
    follow_redirect!(headers: inertia_headers)
    assert_equal "Ce lieu est trop loin pour ce pilote.", response.parsed_body.dig("props", "errors", "map")
  end

  test "a pilot who is not listed is not shown" do
    @pilot.update!(status: "suspended", review_note: "Assurance expirée")
    sign_in_as users(:michael)
    get drone_pilot_path(@pilot)
    assert_redirected_to drone_pilots_path
  end
end
