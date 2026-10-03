require "test_helper"

class HardinessZoneTest < ActiveSupport::TestCase
  test "zone from the average annual extreme minimum" do
    assert_equal "8a", HardinessZone.for_temperature(-10.5).code
    assert_equal "7b", HardinessZone.for_temperature(-12.5).code
    assert_equal "7a", HardinessZone.for_temperature(-15.5).code
    assert_equal "9a", HardinessZone.for_temperature(-5.5).code
    assert_nil HardinessZone.for_temperature(nil)
  end

  test "half-zone bounds follow the USDA 5 °F steps" do
    zone = HardinessZone.new(7, "b")
    assert_equal(-15.0, zone.min_c)
    assert_equal(-12.2, zone.max_c)
    assert_equal "7b", HardinessZone.for_temperature(-15.0).code, "lower bound belongs to the zone"
    assert_equal "7a", HardinessZone.for_temperature(-15.01).code
  end

  test "extreme temperatures are clamped to zones 1a and 13b" do
    assert_equal "1a", HardinessZone.for_temperature(-70).code
    assert_equal "13b", HardinessZone.for_temperature(40).code
  end

  test "parses catalogue notations" do
    assert_equal "7a", HardinessZone.parse("zone-7").code
    assert_equal "8b", HardinessZone.parse("Zone 8b").code
    assert_equal "5a", HardinessZone.parse("USDA 5").code
    assert_equal "6a", HardinessZone.parse(6).code
    assert_nil HardinessZone.parse("")
    assert_nil HardinessZone.parse("zone-14")
    assert_nil HardinessZone.parse("rustique")
  end

  test "compares on a continuous scale" do
    assert HardinessZone.parse("8a") > HardinessZone.parse("7b")
    assert_equal 7.5, HardinessZone.parse("7b").value
  end
end
