# Stubs for the PVGIS API (real answers captured at Yvoir, lat 50.32 lon 4.88).
module SunTestHelper
  PVGIS = %r{\Ahttps://re\.jrc\.ec\.europa\.eu/api/v5_3/}

  def stub_pvgis_horizon(status: 200, body: file_fixture("sun/printhorizon.json").read)
    stub_request(:get, %r{#{PVGIS}printhorizon}).to_return(status:, body:, headers: { "Content-Type" => "application/json" })
  end

  def stub_pvgis_irradiation(status: 200, body: file_fixture("sun/mrcalc.json").read)
    stub_request(:get, %r{#{PVGIS}MRcalc}).to_return(status:, body:, headers: { "Content-Type" => "application/json" })
  end

  def stub_pvgis
    [ stub_pvgis_horizon, stub_pvgis_irradiation ]
  end

  # Tests run with a null cache store: swap in a real one when caching is
  # what we test.
  def with_memory_cache
    original = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = original
  end
end
