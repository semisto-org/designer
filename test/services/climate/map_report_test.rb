require "test_helper"
require_relative "../../test_helpers/climate_test_helper"
require_relative "../../test_helpers/plant_stubs"

class Climate::MapReportTest < ActiveSupport::TestCase
  include ClimateTestHelper
  include PlantStubs

  setup do
    seed_climate!
    @map = maps(:ahinvaux).reload
    fig = species(id: 1, latin_name: "Ficus carica", common_name: "Figuier", min_temperature_c: -8)
    hazel = species(id: 2, latin_name: "Corylus avellana", common_name: "Noisetier", hardiness_zone: 4)
    @inventory = MapPlantInventory.new(@map, palette: [
      palette_item(id: 1, common_name: "Figuier", quantity: 2, plant_species: fig),
      palette_item(id: 2, common_name: "Noisetier", quantity: 12, plant_species: hazel),
      palette_item(id: 3, name: "Inconnue", quantity: 1)
    ])
  end

  def report(plan) = Climate::MapReport.new(@map, entitlements: Entitlements.new(plan), inventory: @inventory).as_json

  test "paid plan: current climate, projections and plant checks" do
    json = with_billing { report("yearly") }
    assert json["entitled"]
    assert_equal "condroz_famenne", json["current"]["subArea"]["key"]
    assert_equal "8a", json["current"]["zone"]["code"]
    assert_equal(-10.0, json["current"]["normals"]["extremeMinC"])
    assert json["current"]["references"]["extremeMinC"]["detail"].present?
    assert json["projections"]["horizons"]["2050"]["moderate"]["references"]["meanTempC"].present?

    assert json["projections"]["available"]
    assert_equal %w[moderate high], json["projections"]["scenarios"].map { _1["key"] }
    assert_equal "9a", json["projections"]["horizons"]["2080"]["high"]["zone"]["code"]

    plants = json["plants"]
    assert_equal 3, plants["count"]
    fig = plants["items"].find { _1["name"] == "Figuier" }
    assert_equal "at_risk", fig["today"]["status"]
    assert_equal "ok", fig["future"]["2080"]["high"]["status"]
    assert_equal "ok", plants["items"].find { _1["name"] == "Noisetier" }["today"]["status"]
    assert_equal({ "at_risk" => 1, "ok" => 1, "unknown" => 1 }, plants["summary"]["today"])
    assert json["sources"].any? { _1["key"] == "cckp_cmip6" }
  end

  test "free plan: current zone only, the rest is locked" do
    json = with_billing { report("free") }
    assert_not json["entitled"]
    assert_equal "8a", json["current"]["zone"]["code"]
    assert_equal({ "locked" => true }, json["projections"])
    assert_equal({ "locked" => true, "count" => 3 }, json["plants"])
    assert json["sources"].none? { _1["key"] == "cckp_cmip6" }
  end

  test "a map without an outline has no location" do
    @map.update_columns(center: nil)
    json = report("yearly")
    assert_nil json["location"]
    assert_equal({ "available" => false, "reason" => "no_location" }, json["current"])
    assert_equal "no_location", json["projections"]["reason"]
  end
end
