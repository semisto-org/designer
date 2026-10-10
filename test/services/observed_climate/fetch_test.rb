require "test_helper"
require_relative "../../test_helpers/observed_climate_test_helper"

class ObservedClimate::FetchTest < ActiveSupport::TestCase
  include ObservedClimateTestHelper

  setup do
    @record = ObservedClimate.create!(cell_lat: 50.3, cell_lng: 4.9, first_year: 1995, last_year: 1995)
    @era5 = Providers::Era5Land.new(api_key: "cds-test-token")
  end

  def step = ObservedClimate::Fetch.new(@record, provider: @era5).step

  test "submit, poll, then download and compute" do
    stub_cds_submit(job_id: "job-1")
    assert_equal 20.seconds, step
    assert_equal "job-1", @record.reload.job_id
    assert @record.submitted_at

    stub_cds_job("running")
    assert_equal 30.seconds, step
    assert @record.reload.pending?

    stub_cds_job("successful")
    stub_cds_results
    # Two days of 1995 are not a complete year.
    assert_nil step
    assert @record.reload.failed?
    assert_equal "no complete year in the series", @record.error
  end

  test "a complete year becomes a ready record with its indicators" do
    csv = +"valid_time,t2m,tp\n"
    (Date.new(1995, 1, 1)..Date.new(1995, 12, 31)).each do |date|
      [ 3, 15 ].each { |hour| csv << "#{date} #{format('%02d', hour)}:00:00,#{hour == 3 ? 272.15 : 285.15},0.0001\n" }
    end
    @record.update!(job_id: "job-1")
    stub_cds_job("successful")
    stub_cds_results(body: csv)

    assert_nil step
    @record.reload
    assert @record.ready?
    assert @record.computed_at
    assert_equal 1, @record.indicators["years"]
    assert_equal 73, @record.indicators["annual"]["rain_mm"] # 2 × 0.1 mm a day
    assert_equal(-1.0, @record.indicators["annual"]["annual_min_c"])
  end

  test "a failed CDS job or a refused request fails the record" do
    @record.update!(job_id: "job-1")
    stub_cds_job("failed")
    stub_request(:get, "#{JOBS}/job-1/results").to_return(status: 400, body: { title: "no data" }.to_json)
    assert_nil step
    assert_equal "no data", @record.reload.error

    other = ObservedClimate.create!(cell_lat: 10.0, cell_lng: 10.0, first_year: 1995, last_year: 2024)
    stub_cds_submit(status: 403, body: { detail: "licences not accepted" })
    assert_nil ObservedClimate::Fetch.new(other, provider: @era5).step
    assert_match "licences not accepted", other.reload.error
  end

  test "upstream errors are retried, within bounded attempts" do
    stub_request(:post, /execution/).to_return(status: 502)
    assert_equal 20.seconds, step
    assert @record.reload.pending?

    @record.update!(attempts: ObservedClimate::Fetch::MAX_ATTEMPTS)
    assert_nil step
    assert @record.reload.failed?
  end

  test "does nothing for a ready record, fails without a key" do
    @record.update!(status: "ready")
    assert_nil step
    @record.update!(status: "pending")
    assert_nil ObservedClimate::Fetch.new(@record, provider: Providers::Era5Land.new(api_key: nil)).step
    assert @record.reload.failed?
  end
end
