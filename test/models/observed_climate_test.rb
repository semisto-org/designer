require "test_helper"

class ObservedClimateTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  def point(lng, lat) = Providers::Climate::Point.new(lng:, lat:)

  test "maps in the same grid cell share one record; only the cell is stored" do
    a = ObservedClimate.for_point(point(4.9075, 50.341))
    b = ObservedClimate.for_point(point(4.88, 50.29))
    assert_equal a, b
    assert_equal({ lat: 50.3, lng: 4.9 }, a.cell)
    assert_equal [ 1995, 2024 ], [ a.first_year, a.last_year ]
    assert_not_equal a, ObservedClimate.for_point(point(4.96, 50.341))
  end

  test "the first request queues the job, the next ones do not" do
    assert_enqueued_jobs(1, only: ObservedClimateJob) do
      ObservedClimate.ensure_for(point(4.9, 50.3))
      ObservedClimate.ensure_for(point(4.91, 50.31))
    end
  end

  test "a failed cell is tried again after a day, a stuck one after six hours" do
    record = ObservedClimate.create!(cell_lat: 50.3, cell_lng: 4.9, first_year: 1995, last_year: 2024, status: "failed", error: "x", attempts: 4)
    assert_no_enqueued_jobs { ObservedClimate.ensure_for(point(4.9, 50.3)) }

    record.update_columns(updated_at: 2.days.ago)
    assert_enqueued_jobs(1, only: ObservedClimateJob) { ObservedClimate.ensure_for(point(4.9, 50.3)) }
    record.reload
    assert record.pending?
    assert_equal [ 0, nil, nil ], [ record.attempts, record.error, record.job_id ]

    record.update_columns(updated_at: 7.hours.ago, job_id: "lost")
    assert_enqueued_jobs(1, only: ObservedClimateJob) { ObservedClimate.ensure_for(point(4.9, 50.3)) }
    assert_nil record.reload.job_id
  end

  test "a stale copy cannot restart a record twice" do
    record = ObservedClimate.create!(cell_lat: 50.3, cell_lng: 4.9, first_year: 1995, last_year: 2024, status: "failed")
    record.update_columns(updated_at: 2.days.ago)
    copy = ObservedClimate.find(record.id)
    assert record.restart!
    assert_not copy.restart!
  end

  test "validates its status" do
    assert_not ObservedClimate.new(cell_lat: 1, cell_lng: 1, first_year: 1995, last_year: 2024, status: "done").valid?
  end
end
