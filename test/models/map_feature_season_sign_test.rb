require "test_helper"

class MapFeatureSeasonSignTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Saisons", owner: users(:michael), region: regions(:wallonia))
  end

  def create_sign(properties)
    @map.features.create!(layer: "notes", kind: "season_sign", geometry: { "type" => "Point", "coordinates" => [ 4.9, 50.34 ] }, properties:)
  end

  test "a sign keeps the day the phone gives, and is seen now without one" do
    assert_equal Time.utc(2026, 10, 18, 8), create_sign("sign" => "first_frost", "observed_at" => "2026-10-18T08:00:00Z").observed_at
    travel_to Time.utc(2026, 10, 19, 12) do
      assert_equal "2026-10-19T12:00:00Z", create_sign("sign" => "nest").properties["observed_at"]
    end
  end

  test "only the signs of the library are accepted" do
    assert_raises(ActiveRecord::RecordInvalid) { create_sign("sign" => "rainbow") }
  end

  test "the year of observation counts signs, downpours and visit notes by season, and names the missing ones" do
    travel_to Time.utc(2026, 10, 19, 12) do
      create_sign("sign" => "first_frost", "observed_at" => "2026-10-12T07:00:00Z")
      create_sign("sign" => "snow_melts_first", "observed_at" => "2025-12-02T07:00:00Z")
      create_sign("sign" => "nest", "observed_at" => "2025-06-01T07:00:00Z") # more than a year ago
      @map.features.create!(layer: "water", kind: "storm_observation", properties: { "observed_at" => "2026-03-03T15:00:00Z" },
        geometry: { "type" => "Point", "coordinates" => [ 4.9, 50.34 ] })
      @map.features.create!(layer: "notes", kind: "note_point", properties: { "visit" => SecureRandom.uuid, "taken_at" => "2026-04-02T10:00:00Z" },
        geometry: { "type" => "Point", "coordinates" => [ 4.9, 50.34 ] })
      @map.features.create!(layer: "notes", kind: "note_point", properties: { "taken_at" => "2026-07-02T10:00:00Z" }, # not a visit note
        geometry: { "type" => "Point", "coordinates" => [ 4.9, 50.34 ] })

      year = MapFeature::SeasonSign.observation_year(@map)
      assert_equal({ "winter" => 1, "spring" => 2, "summer" => 0, "autumn" => 1 }, year[:seasons])
      assert_equal %w[summer], year[:missing]
    end
  end
end
