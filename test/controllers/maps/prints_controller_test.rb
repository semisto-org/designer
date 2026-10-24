require "test_helper"

class Maps::PrintsControllerTest < ActionDispatch::IntegrationTest
  test "notes the first time the plan goes to paper" do
    map = maps(:ahinvaux)
    sign_in_as users(:alice) # a viewer may print too
    travel_to Time.zone.local(2026, 10, 27, 10, 0) do
      post map_print_path(map), as: :json
    end
    assert_response :no_content
    travel_to Time.zone.local(2026, 11, 2, 10, 0) do
      post map_print_path(map), as: :json
    end
    assert_equal Time.zone.local(2026, 10, 27, 10, 0), map.reload.plan_printed_at
  end

  test "only for people who can open the map" do
    sign_in_as users(:bob)
    post map_print_path(maps(:ahinvaux)), as: :json
    assert_response :not_found
    assert_nil maps(:ahinvaux).reload.plan_printed_at
  end
end
