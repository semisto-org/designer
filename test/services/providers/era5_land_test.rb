require "test_helper"
require_relative "../../test_helpers/observed_climate_test_helper"

class Providers::Era5LandTest < ActiveSupport::TestCase
  include ObservedClimateTestHelper

  def era5 = Providers::Era5Land.new(api_key: "cds-test-token")

  test "not configured without a key" do
    assert_not Providers::Era5Land.from_env({}).configured?
    assert Providers::Era5Land.from_env({ "CDS_API_KEY" => "x" }).configured?
    assert_raises(Providers::Era5Land::Error) { Providers::Era5Land.new(api_key: nil).submit(lat: 50, lng: 4, first_year: 1995, last_year: 2024) }
  end

  test "the grid cell is the nearest 0.1° point" do
    assert_equal [ 50.3, 4.9 ], Providers::Era5Land.cell(50.341, 4.9075)
    assert_equal [ -0.1, -1.0 ], Providers::Era5Land.cell(-0.06, -0.96)
  end

  test "submits the point time series request with the token" do
    stub_cds_submit(job_id: "abc")
    assert_equal "abc", era5.submit(lat: 50.3, lng: 4.9, first_year: 1995, last_year: 2024)
    assert_requested(:post, /execution/) do |request|
      body = JSON.parse(request.body)
      request.headers["Private-Token"] == "cds-test-token" &&
        body == { "inputs" => {
          "variable" => %w[2m_temperature total_precipitation],
          "location" => { "latitude" => 50.3, "longitude" => 4.9 },
          "date" => [ "1995-01-01/2024-12-31" ],
          "data_format" => "csv"
        } }
    end
  end

  test "a refused request (licence not accepted) is a client error" do
    stub_cds_submit(status: 403, body: { title: "forbidden", detail: "required licences not accepted" })
    error = assert_raises(Providers::Era5Land::ClientError) { era5.submit(lat: 50.3, lng: 4.9, first_year: 1995, last_year: 2024) }
    assert_match "licences not accepted", error.message
  end

  test "a server error or a timeout is a plain error, to retry" do
    stub_request(:post, /execution/).to_return(status: 503, body: "busy")
    error = assert_raises(Providers::Era5Land::Error) { era5.submit(lat: 50.3, lng: 4.9, first_year: 1995, last_year: 2024) }
    assert_not_kind_of Providers::Era5Land::ClientError, error
    stub_request(:get, "#{JOBS}/slow").to_timeout
    assert_raises(Providers::Era5Land::Error) { era5.job("slow") }
  end

  test "job statuses" do
    { "accepted" => :pending, "running" => :running, "successful" => :successful }.each do |remote, local|
      stub_cds_job(remote)
      assert_equal local, era5.job("job-1").status
    end
  end

  test "a failed job carries the error of its results" do
    stub_cds_job("failed")
    stub_request(:get, "#{JOBS}/job-1/results")
      .to_return(status: 400, body: { title: "The job failed", detail: "MARS returned no data" }.to_json)
    job = era5.job("job-1")
    assert_equal :failed, job.status
    assert_equal "The job failed: MARS returned no data", job.message
  end

  test "downloads the asset without sending the token to another host" do
    stub_cds_results(href: "https://object-store.example.eu/cache/result.csv")
    io = StringIO.new
    assert_equal "text/csv", era5.download("job-1", io)
    assert_match(/\Avalid_time,t2m,tp/, io.string)
    assert_requested(:get, "https://object-store.example.eu/cache/result.csv") { |request| request.headers["Private-Token"].nil? }
  end

  test "a relative asset href is resolved against the API" do
    stub_cds_results(href: "/api/retrieve/v1/files/result.csv")
    io = StringIO.new
    era5.download("job-1", io)
    assert io.string.present?
    assert_requested(:get, "#{CDS}/retrieve/v1/files/result.csv") { |request| request.headers["Private-Token"] == "cds-test-token" }
  end
end
