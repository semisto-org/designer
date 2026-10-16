require "test_helper"

class MapFeatureInfiltrationTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Sol", owner: users(:michael), region: regions(:wallonia))
  end

  def create_test(properties = {})
    @map.features.create!(layer: "water", kind: "infiltration_test", geometry: { "type" => "Point", "coordinates" => [ 4.9, 50.34 ] }, properties:)
  end

  test "a new test is a 30 cm hole, without a rate until it has readings" do
    feature = create_test
    assert_equal "hole", feature.properties["method"]
    assert_equal 30, feature.properties["hole_diameter_cm"]
    assert_nil feature.infiltration_rate_mm_h
  end

  test "the server derives the rate from the readings and keeps it in step" do
    feature = create_test("method" => "ring", "started_at" => "2026-10-16T09:00:00Z",
                          "readings" => [ 0, 10, 20, 30 ].each_with_index.map { |m, i| { "t_s" => m * 60, "depth_cm" => 10 - i * 2 } })
    assert_equal 120.0, feature.infiltration_rate_mm_h
    assert_equal true, feature.properties["rate_stable"]
    assert_equal "2026-10-16T09:00:00Z", feature.properties["started_at"]

    feature.update!(properties: feature.properties.merge("readings" => feature.properties["readings"].first(2)))
    assert_nil feature.reload.properties["rate_mm_h"]
    assert_nil feature.properties["rate_stable"]
  end

  test "a rate sent by the client is not trusted, and bad readings are refused" do
    feature = create_test("rate_mm_h" => 999, "started_at" => "hier")
    assert_nil feature.properties["rate_mm_h"]
    assert_nil feature.properties["started_at"]

    feature.properties = feature.properties.merge("readings" => [ { "t_s" => 60, "depth_cm" => 300 } ])
    refute feature.valid?
    assert_includes feature.errors.full_messages, I18n.t("infiltration.errors.readings")
  end
end
