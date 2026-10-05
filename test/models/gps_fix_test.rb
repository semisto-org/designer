require "test_helper"

# Points placed from the phone keep their GPS accuracy; the imprecise ones
# are flagged until someone moves them or says they are well placed.
class GpsFixTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def place!(properties)
    @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: 4.906, lat: 50.341), properties:)
  end

  test "the accuracy is stored in meters, rounded to the decimeter" do
    feature = place!("gps_accuracy_m" => "14.2371")
    assert_equal 14.2, feature.reload.gps_accuracy_m
    assert feature.gps_to_check?
  end

  test "a precise fix needs no check" do
    feature = place!("gps_accuracy_m" => 4.0)
    assert_not feature.gps_to_check?
  end

  test "a missing, negative or unreadable accuracy is dropped, with its check" do
    [ nil, -3, "far", 0 ].each do |value|
      feature = place!("gps_accuracy_m" => value, "gps_checked" => true)
      assert_not feature.properties.key?("gps_accuracy_m"), value.inspect
      assert_not feature.properties.key?("gps_checked"), value.inspect
      assert_nil feature.gps_accuracy_m
    end
  end

  test "saying the point is well placed clears the flag" do
    feature = place!("gps_accuracy_m" => 18)
    feature.update!(properties: feature.properties.merge("gps_checked" => "true"))
    assert_equal true, feature.reload.properties["gps_checked"]
    assert_not feature.gps_to_check?
  end

  test "moving the point by hand clears the flag" do
    feature = place!("gps_accuracy_m" => 18)
    feature.update!(geometry: point(lng: 4.9061, lat: 50.3411))
    assert_equal true, feature.reload.properties["gps_checked"]
    assert_equal 18.0, feature.gps_accuracy_m
  end

  test "renaming the point keeps it flagged" do
    feature = place!("gps_accuracy_m" => 18)
    feature.update!(name: "Vieux chêne")
    assert feature.reload.gps_to_check?
  end

  test "a point drawn on the site has no GPS accuracy and is never flagged" do
    feature = place!({})
    feature.update!(geometry: point(lng: 4.9061, lat: 50.3411))
    assert_not feature.reload.properties.key?("gps_checked")
    assert_not feature.gps_to_check?
  end
end
