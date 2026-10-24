require "test_helper"
require "test_helpers/drone_pilots_test_helper"

# The pilot of a paid drone mission puts their data on the client's map:
# drone views (an orthophoto, or a single-band raster coloured on import)
# and photos, without counting against the client's storage.
class Maps::DroneMissionDeliveryTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper

  setup do
    @map = maps(:ahinvaux)
    @pilot = create_pilot(users(:bob))
  end

  def announce(mission, product: "thermal")
    post map_aerial_views_path(@map, drone_mission_id: mission.id),
      params: { aerial_view: { name: "Thermique", captured_on: "2027-02-15", product: }, file: { filename: "thermal.tif", byte_size: 1_000 } }, as: :json
  end

  test "the pilot of a paid mission imports a thermal view on the client's map" do
    mission = paid_mission(pilot: @pilot, client: users(:michael), map: @map)
    sign_in_as users(:bob)
    announce(mission)
    assert_response :created
    view = AerialView.find(response.parsed_body.dig("aerialView", "id"))
    assert_equal [ mission, "thermal", users(:bob) ], [ view.drone_mission, view.product, view.created_by ]
  end

  test "not before the mission is paid, and an unknown product is refused" do
    mission = request_mission(pilot: @pilot, client: users(:michael), map: @map)
    sign_in_as users(:bob)
    announce(mission)
    assert_response :not_found
    assert_equal 0, AerialView.count

    mission.accept!(flight_on: nil)
    mission.record_payment!(session_id: "cs", payment_intent_id: "pi", paid_at: Time.current, livemode: false)
    announce(mission, product: "lidar")
    assert_response :unprocessable_content
  end

  test "the pilot reads the map while the mission is open, but does not edit it" do
    request_mission(pilot: @pilot, client: users(:michael), map: @map)
    sign_in_as users(:bob)
    post map_aerial_views_path(@map), params: { aerial_view: { name: "x", captured_on: "2027-02-15" }, file: { filename: "x.tif", byte_size: 1_000 } }, as: :json
    assert_response :forbidden
  end
end
