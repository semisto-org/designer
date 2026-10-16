require "test_helper"
require_relative "../../test_helpers/observed_climate_test_helper"
require_relative "../../test_helpers/water_balance_test_helper"

class Maps::WaterBalancesControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  include ObservedClimateTestHelper
  include WaterBalanceTestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  test "requires a role on the map" do
    sign_in_as users(:bob)
    get map_water_balance_path(@map), as: :json
    assert_response :not_found
  end

  test "follows the observed climate: off without a CDS key, pending while it computes" do
    sign_in_as users(:alice)
    get map_water_balance_path(@map), as: :json
    assert_equal({ "available" => false, "reason" => "not_configured" }, response.parsed_body)

    with_cds_key do
      get map_water_balance_path(@map), as: :json
      assert_equal({ "available" => true, "status" => "pending" }, response.parsed_body)
    end
  end

  test "month by month, today and in 2050, with what the map holds" do
    climate = @map.region.settings.to_h.merge("climate" => { "projections" => { "horizons" => {
      "2050" => { "moderate" => { "mean_temp_delta_c" => [ 0.8, 1.3, 2.2 ], "summer_precip_change_pct" => [ -20, -8, 5 ] } }
    } } })
    @map.region.update!(settings: climate)
    @map.features.create!(layer: "water", kind: "water_tank", properties: { "capacity_l" => 10_000 },
      geometry: { "type" => "Point", "coordinates" => [ @map.center.x, @map.center.y ] })
    sign_in_as users(:alice)

    with_cds_key do
      get map_water_balance_path(@map), as: :json
      ObservedClimate.sole.update!(status: "ready", computed_at: Time.current, indicators: { months: YVOIR_MONTHS })
      get map_water_balance_path(@map), as: :json
    end
    json = response.parsed_body
    assert_equal "ready", json["status"]
    assert_equal 12, json.dig("observed", "months").size
    assert_equal [ 6, 7, 8 ], json.dig("observed", "dryMonths")
    assert_equal 1.3, json.dig("future", "warmingC")
    assert_operator json.dig("future", "annual", "deficitMm"), :>, json.dig("observed", "annual", "deficitMm")
    assert_equal 10.0, json.dig("storage", "tanksM3")
    assert json.dig("storage", "wateredM2").positive?
    assert_equal "CC BY 4.0", json.dig("source", "licence")
  end
end
