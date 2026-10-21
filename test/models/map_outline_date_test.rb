require "test_helper"

class MapOutlineDateTest < ActiveSupport::TestCase
  test "a place remembers when it first got its outline" do
    map = Map.create!(name: "Le verger", owner: users(:alice), region: regions(:wallonia))
    assert_nil map.outlined_at

    travel_to Time.zone.local(2026, 10, 26, 14, 5) do
      map.update!(boundary: square)
    end
    assert_equal Time.zone.local(2026, 10, 26, 14, 5), map.reload.outlined_at

    travel_to Time.zone.local(2026, 11, 3, 9, 0) do
      map.update!(boundary: square(size: 0.002))
      map.update!(name: "Le grand verger")
    end
    assert_equal Time.zone.local(2026, 10, 26, 14, 5), map.reload.outlined_at, "redrawing keeps the first date"
  end

  test "a place created with its outline (a kept trial) is outlined from the start" do
    map = Map.create!(name: "Chez moi", owner: users(:alice), region: regions(:wallonia), boundary: square)
    assert_in_delta map.created_at, map.outlined_at, 1.second
  end
end
