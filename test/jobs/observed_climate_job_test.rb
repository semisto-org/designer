require "test_helper"
require_relative "../test_helpers/observed_climate_test_helper"

class ObservedClimateJobTest < ActiveJob::TestCase
  include ObservedClimateTestHelper

  setup do
    @record = ObservedClimate.create!(cell_lat: 50.3, cell_lng: 4.9, first_year: 1995, last_year: 2024)
  end

  test "re-enqueues itself with a delay while the CDS job is not done" do
    stub_cds_submit
    with_cds_key do
      assert_enqueued_with(job: ObservedClimateJob, args: [ @record ]) { ObservedClimateJob.perform_now(@record) }
    end
    assert_equal "job-1", @record.reload.job_id
  end

  test "stops when the record is failed or ready" do
    assert_no_enqueued_jobs { ObservedClimateJob.perform_now(@record) } # no key: fails
    assert @record.reload.failed?
    assert_no_enqueued_jobs { ObservedClimateJob.perform_now(@record) }
  end
end
