require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/offline_site_helper"

# The user's AI prepares the offline site and hands the person its link.
class McpOfflineSiteTest < ActionDispatch::IntegrationTest
  include McpTestHelper
  include OfflineSiteHelper
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice), access: "read")
  end

  test "starts the build, then gives the download link once ready" do
    data, error = nil
    assert_enqueued_with(job: OfflineSiteJob) { data, error = call_tool(@viewer, "prepare_offline_site", { map_id: @map.id }) }
    refute error, data
    assert_equal "building", data["status"]
    assert_nil data["download_url"]

    with_fake_viewer { perform_enqueued_jobs }
    data, = call_tool(@viewer, "prepare_offline_site", { map_id: @map.id })
    assert_equal "ready", data["status"]
    assert_equal "http://www.example.com/maps/#{@map.id}/offline_site/download", data["download_url"]
    assert_equal 0, data["contents"]["photos"]
    assert_equal({ "status" => "ready" }, AiAction.last.result)
  end

  test "a ready site is given as is, unless asked to rebuild" do
    with_fake_viewer do
      MapOfflineSite.request!(@map, by: users(:michael))
      perform_enqueued_jobs
    end
    assert_no_enqueued_jobs(only: OfflineSiteJob) { call_tool(@owner, "prepare_offline_site", { map_id: @map.id }) }
    assert_enqueued_with(job: OfflineSiteJob) { call_tool(@owner, "prepare_offline_site", { map_id: @map.id, rebuild: true }) }
  end

  test "networks for editors only; archived maps too; never another's map" do
    call_tool(@viewer, "prepare_offline_site", { map_id: @map.id, include_networks: true })
    assert_not @map.reload.offline_site.include_networks

    @map.archive!
    data, error = call_tool(@owner, "prepare_offline_site", { map_id: @map.id, include_networks: true })
    refute error, data
    assert @map.reload.offline_site.include_networks

    other = Map.create!(name: "Ailleurs", owner: users(:bob), region: regions(:wallonia))
    _, error = call_tool(@owner, "prepare_offline_site", { map_id: other.id })
    assert error
  end
end
