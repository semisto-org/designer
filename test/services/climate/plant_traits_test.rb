require "test_helper"
require_relative "../../test_helpers/plant_stubs"

class Climate::PlantTraitsTest < ActiveSupport::TestCase
  include PlantStubs

  test "explicit minimum temperature wins" do
    traits = Climate::PlantTraits.from(species(min_temperature_c: -8, hardiness_zone: 5))
    assert_equal(-8.0, traits.cold_limit_c)
  end

  test "hardiness zone gives the cold limit of its colder half" do
    assert_equal(-23.3, Climate::PlantTraits.from(species(hardiness_zone: 6)).cold_limit_c)
    assert_equal(-12.2, Climate::PlantTraits.from(species(hardiness_zone: "8a")).cold_limit_c)
  end

  test "legacy hardiness text: temperatures first, then zones" do
    assert_equal(-30.0, Climate::PlantTraits.from(species(hardiness: "-25/-30°C (USDA 4)")).cold_limit_c)
    assert_equal(-15.0, Climate::PlantTraits.from(species(hardiness: "-15°C")).cold_limit_c)
    assert_equal "5a", Climate::PlantTraits.from(species(hardiness: "zone-5")).hardiness_zone.code
    assert_nil Climate::PlantTraits.from(species(hardiness: "rustique")).cold_limit_c
  end

  test "drought tolerance from explicit fields only" do
    assert_equal :sensitive, Climate::PlantTraits.from(species(drought_tolerance: "low")).drought
    assert_equal :tolerant, Climate::PlantTraits.from(species(soil_moisture: "dry")).drought
    assert_equal :sensitive, Climate::PlantTraits.from(species(watering_need: "5")).drought
    assert_nil Climate::PlantTraits.from(species(soil_moisture: "moist", watering_need: "3")).drought
    # The catalogue stores soil moisture as a list of vocabulary keys.
    assert_equal :tolerant, Climate::PlantTraits.from(species(soil_moisture: %w[dry moist])).drought
    assert_equal :sensitive, Climate::PlantTraits.from(species(soil_moisture: %w[wet waterlogged])).drought
    assert_nil Climate::PlantTraits.from(species(soil_moisture: %w[moist wet])).drought
    assert_nil Climate::PlantTraits.from(species(soil_moisture: [])).drought
    # An explicit watering need wins over the soil heuristic.
    assert_equal :sensitive, Climate::PlantTraits.from(species(soil_moisture: %w[dry], watering_need: 5)).drought
  end

  test "unknown or missing species" do
    assert_not Climate::PlantTraits.from(nil).known?
    assert_not Climate::PlantTraits.from(Object.new).known?
    assert Climate::PlantTraits.from(species(max_hardiness_zone: 8)).known?
  end
end
