require "test_helper"

class MapOfflineSiteTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup { @map = maps(:ahinvaux) }

  test "request! starts a build and keeps one site per map" do
    site = nil
    assert_enqueued_with(job: OfflineSiteJob) { site = MapOfflineSite.request!(@map, by: users(:michael)) }
    assert_equal "pending", site.status
    assert_equal users(:michael), site.requested_by
    assert_equal site, @map.reload.offline_site

    site.update!(status: "ready", finished_at: Time.current)
    again = MapOfflineSite.request!(@map, by: users(:alice))
    assert_equal site.id, again.id
    assert_equal "pending", again.status
    assert_equal users(:alice), again.requested_by
  end

  test "asking again while a build runs does not start another, unless the networks change" do
    MapOfflineSite.request!(@map, by: users(:michael))
    assert_no_enqueued_jobs(only: OfflineSiteJob) { MapOfflineSite.request!(@map, by: users(:michael)) }
    assert_enqueued_with(job: OfflineSiteJob) { MapOfflineSite.request!(@map, by: users(:michael), include_networks: true) }
  end

  test "a build silent for an hour is dead and may be asked again" do
    site = MapOfflineSite.request!(@map, by: users(:michael))
    travel MapOfflineSite::STALE_AFTER + 1.minute do
      assert_not site.working?
      assert_equal "none", site.as_inertia[:status]
      assert_enqueued_with(job: OfflineSiteJob) { MapOfflineSite.request!(@map, by: users(:michael)) }
    end
  end

  test "the archive's name says the map and the day" do
    site = @map.build_offline_site(finished_at: Time.zone.local(2026, 10, 19, 22))
    assert_equal "terranova-domaine-d-ahinvaux-2026-10-19.zip", site.filename
  end

  test "goes with its map" do
    MapOfflineSite.request!(@map, by: users(:michael))
    assert_difference("MapOfflineSite.count", -1) { @map.destroy }
  end
end
