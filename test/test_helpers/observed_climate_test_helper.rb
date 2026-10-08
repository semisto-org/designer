# CDS (Copernicus Climate Data Store) stubs for the observed climate.
module ObservedClimateTestHelper
  CDS = "https://cds.climate.copernicus.eu/api".freeze
  JOBS = "#{CDS}/retrieve/v1/jobs".freeze

  def with_cds_key(key = "cds-test-token")
    previous = ENV["CDS_API_KEY"]
    ENV["CDS_API_KEY"] = key
    yield
  ensure
    ENV["CDS_API_KEY"] = previous
  end

  def stub_cds_submit(job_id: "job-1", status: 201, body: nil)
    stub_request(:post, "#{CDS}/retrieve/v1/processes/reanalysis-era5-land-timeseries/execution")
      .to_return(status:, body: (body || { jobID: job_id, status: "accepted" }).to_json, headers: { "Content-Type" => "application/json" })
  end

  def stub_cds_job(status, job_id: "job-1")
    stub_request(:get, "#{JOBS}/#{job_id}")
      .to_return(status: 200, body: { jobID: job_id, status: }.to_json, headers: { "Content-Type" => "application/json" })
  end

  def stub_cds_results(href: "https://object-store.example.eu/cache/result.csv", job_id: "job-1", body: nil, type: "text/csv")
    stub_request(:get, "#{JOBS}/#{job_id}/results")
      .to_return(status: 200, body: { asset: { value: { type:, href:, "file:size" => 100 } } }.to_json, headers: { "Content-Type" => "application/json" })
    stub_request(:get, href.start_with?("http") ? href : "#{CDS}/#{href.delete_prefix('/api/').delete_prefix('/')}")
      .to_return(status: 200, body: body || file_fixture("observed_climate/era5_land_two_days.csv").read)
  end
end
