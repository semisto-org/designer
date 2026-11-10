require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

class AerialViews::RealignTest < ActiveSupport::TestCase
  include DroneTestHelper
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @user = users(:michael)
  end

  def ready_view
    view = imported_view(@map, @user, bytes: file_fixture("drone-ortho.tif").binread, status: "processing")
    AerialViews::Import.new(view).call
    view.reload
  end

  # [lng, lat] moved by metres east and north.
  def offset(point, east:, north:)
    lng, lat = point
    [ lng + east / (111_320.0 * Math.cos(lat * Math::PI / 180)), lat + north / 110_574.0 ]
  end

  test "a landmark pair cuts the view again where it belongs, and replaces its tiles in one step" do
    skip_without_imagery_tools
    view = ready_view
    before = view.bounds
    old_blob = view.archive.blob
    centre = [ (before["west"] + before["east"]) / 2, (before["south"] + before["north"]) / 2 ]

    assert_enqueued_with(job: AerialViewRealignJob) do
      view.request_alignment!([ { from: centre, to: offset(centre, east: 4, north: 0) } ], by: @user)
    end
    assert_equal "pending", view.alignments.last["status"]
    assert view.ready?, "the view stays on the map meanwhile"

    AerialViews::Realign.new(view).call
    view.reload
    assert_equal "done", view.alignments.last["status"]
    assert_in_delta 4, view.alignments.last["shift_m"], 0.1
    refute_equal old_blob.id, view.archive.blob.id
    assert_equal "webp", AerialViews::PmtilesHeader.read(ActiveStorage::Blob.service.path_for(view.archive.key)).tile_type
    shift = 4 / (111_320.0 * Math.cos(centre[1] * Math::PI / 180))
    # The extent snaps to whole tiles: within a tile of where it should be.
    tile = 360.0 / 2**view.max_zoom
    assert_in_delta before["west"] + shift, view.bounds["west"], tile
    assert_in_delta before["east"] + shift, view.bounds["east"], tile
    assert_in_delta before["north"], view.bounds["north"], tile
    assert_includes view.as_inertia(archive_url: "/maps/1/aerial_views/#{view.id}/archive")[:url], "?v=#{view.archive.blob.id}"
  end

  test "a realignment that cannot be done says why, and leaves the view as it was" do
    view = aerial_view(@map, status: "ready")
    view.update_columns(alignments: [ { "pairs" => [ { "from" => [ 4.87, 50.33 ], "to" => [ 4.87, 50.33 ] } ], "status" => "pending", "at" => Time.current.iso8601 } ])
    AerialViews::Realign.new(view).call
    assert_equal [ "failed", "empty" ], view.reload.alignments.last.values_at("status", "failure")
  end

  test "only an imported, ready view is realigned, one realignment at a time" do
    staff = aerial_view(@map, status: "ready")
    error = assert_raises(AerialViews::Alignment::Invalid) { staff.request_alignment!([ { from: [ 4.87, 50.33 ], to: [ 4.87, 50.33 ] } ], by: @user) }
    assert_equal "not_alignable", error.code

    skip_without_imagery_tools
    view = ready_view
    pair = [ { from: [ 4.876, 50.331 ], to: [ 4.87601, 50.331 ] } ]
    view.request_alignment!(pair, by: @user)
    assert_equal "busy", assert_raises(AerialViews::Alignment::Invalid) { view.request_alignment!(pair, by: @user) }.code
    travel AerialView::STALE_ALIGNMENT + 1.minute do
      view.request_alignment!(pair, by: @user)
      assert_equal %w[failed pending], view.alignments.map { _1["status"] }
    end
  end
end
