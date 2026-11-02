require "test_helper"

class Maps::PlaceReadingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
  end

  test "a viewer reads the place; only an editor marks the page as read, once" do
    sign_in_as users(:alice)
    get map_place_reading_path(@map), as: :json
    assert_response :success
    assert response.parsed_body.key?("reading")
    patch map_place_reading_path(@map), as: :json
    assert_response :forbidden

    sign_in_as users(:michael)
    @map.update_column(:first_hour_started_at, nil)
    patch map_place_reading_path(@map), as: :json
    assert_response :success
    started = @map.reload.first_hour_started_at
    assert started
    travel 1.day do
      patch map_place_reading_path(@map), as: :json
    end
    assert_equal started, @map.reload.first_hour_started_at
  end

  test "strangers see nothing" do
    sign_in_as users(:bob)
    get map_place_reading_path(@map), as: :json
    assert_response :not_found
  end
end
