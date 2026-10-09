require "test_helper"
require_relative "../../test_helpers/observed_climate_test_helper"

class Maps::ObservedClimatesControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  include ObservedClimateTestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  test "requires sign in and a role on the map" do
    get map_observed_climate_path(@map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_observed_climate_path(@map), as: :json
    assert_response :not_found
  end

  test "without a CDS key: off, nothing stored, nothing called" do
    sign_in_as users(:alice)
    assert_no_enqueued_jobs do
      get map_observed_climate_path(@map), as: :json
    end
    assert_equal({ "available" => false, "reason" => "not_configured" }, response.parsed_body)
    assert_equal 0, ObservedClimate.count
    assert_not_requested :any, /copernicus/
  end

  test "with a key: starts the computation of the map's cell, then serves it" do
    sign_in_as users(:alice) # a viewer reads it too
    with_cds_key do
      assert_enqueued_jobs(1, only: ObservedClimateJob) { get map_observed_climate_path(@map), as: :json }
      json = response.parsed_body
      assert_equal "pending", json["status"]
      assert_equal({ "firstYear" => 1995, "lastYear" => 2024 }, json["period"])
      assert_nil json["data"]
      assert_equal "CC BY 4.0", json["source"]["licence"]
      assert_not json.to_json.include?("4.9075"), "the exact location never leaves the server"

      record = ObservedClimate.sole
      record.update!(status: "ready", computed_at: Time.zone.local(2026, 10, 8), indicators: {
        years: 30, annual: { mean_temp_c: 9.8, hot_days: 2.1 },
        frost: { last_spring: { mean: "04-18", late: "05-02", years_with: 30 } },
        months: [ { month: 1, rain_mm: 80 } ]
      })
      assert_no_enqueued_jobs { get map_observed_climate_path(@map), as: :json }
      json = response.parsed_body
      assert_equal "ready", json["status"]
      assert_equal 9.8, json["data"]["annual"]["meanTempC"]
      assert_equal "05-02", json["data"]["frost"]["lastSpring"]["late"]
      assert_equal 80, json["data"]["months"][0]["rainMm"]
      assert_equal 2026, json["source"]["year"]
    end
  end

  test "no location yet" do
    @map.update_columns(center: nil, boundary: nil)
    sign_in_as users(:michael)
    with_cds_key { get map_observed_climate_path(@map), as: :json }
    assert_equal({ "available" => false, "reason" => "no_location" }, response.parsed_body)
  end
end
