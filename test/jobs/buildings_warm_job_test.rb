require "test_helper"
require_relative "../test_helpers/relief_test_helper"

class BuildingsWarmJobTest < ActiveJob::TestCase
  include ReliefTestHelper

  setup do
    configure_relief_region
    @map = small_map
    stub_spw
    Relief::TerrainImport.new(@map.create_terrain!, provider: instant_provider).call
  end

  test "an imported relief and a publication ask for the buildings ahead" do
    assert_enqueued_with(job: BuildingsWarmJob, args: [ @map ]) do
      Relief::TerrainImport.new(@map.terrain, provider: instant_provider).call
    end
    assert_enqueued_with(job: BuildingsWarmJob, args: [ @map ]) { MapPublication.publish!(@map, by: users(:michael)) }
  end

  test "fills the cache with the footprints over the relief" do
    original, Rails.cache = Rails.cache, ActiveSupport::Cache::MemoryStore.new
    stub = stub_request(:get, %r{overpass}).to_return(status: 200, body: { "elements" => [] }.to_json)
    BuildingsWarmJob.perform_now(@map)
    Providers::Buildings.build({}).within(**@map.terrain.bounds)
    assert_requested stub, times: 1
  ensure
    Rails.cache = original
  end

  test "quiet when OpenStreetMap is down or the relief is not ready" do
    stub = stub_request(:get, %r{overpass}).to_return(status: 504)
    assert_nothing_raised { BuildingsWarmJob.perform_now(@map) }
    assert_requested stub, times: 1

    @map.terrain.update!(status: "running")
    BuildingsWarmJob.perform_now(@map)
    assert_requested stub, times: 1
  end
end
