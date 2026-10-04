require "test_helper"
require_relative "../../test_helpers/plant_stubs"

class Climate::ForecastReportTest < ActiveSupport::TestCase
  include PlantStubs

  setup do
    @map = maps(:ahinvaux)
    lemon = species(id: 1, latin_name: "Citrus limon", common_name: "Citronnier", min_temperature_c: -1)
    @inventory = MapPlantInventory.new(@map, palette: [ palette_item(id: 1, common_name: "Citronnier", quantity: 1, plant_species: lemon) ])
  end

  test "soon available without a forecast provider" do
    provider = Providers::Climate::Composite.new(normals: Providers::Climate::Unavailable.new, projections: Providers::Climate::Unavailable.new, forecast: Providers::Climate::OpenMeteo.new(api_key: nil))
    json = Climate::ForecastReport.new(@map, provider:, inventory: @inventory).as_json
    assert_equal({ "available" => false, "reason" => "not_configured", "supported" => false }, json)
  end

  test "frost and heat alerts, with the plants under their threshold" do
    stub_request(:get, %r{customer-api\.open-meteo\.com/v1/forecast})
      .to_return(status: 200, body: file_fixture("open_meteo/forecast.json").read, headers: { "Content-Type" => "application/json" })
    provider = Providers::Climate.for(@map.region, env: { "OPEN_METEO_API_KEY" => "secret" })
    json = Climate::ForecastReport.new(@map, provider:, inventory: @inventory).as_json

    assert json["available"]
    assert_equal 7, json["days"].size
    assert_equal %w[date weatherCode tmaxC tminC precipMm precipProbabilityPct windGustsKmh], json["days"].first.keys
    frost = json["alerts"].find { _1["kind"] == "frost" }
    assert_equal %w[2026-10-08 2026-10-09], frost["dates"]
    assert_equal(-1.8, frost["minC"])
    assert_equal [ { "name" => "Citronnier", "coldLimitC" => -1.0 } ], frost["plants"]
    assert_equal 31.4, json["alerts"].find { _1["kind"] == "heat" }["maxC"]
    assert_equal "Open-Meteo.com", json["attribution"]["name"]
  end
end
