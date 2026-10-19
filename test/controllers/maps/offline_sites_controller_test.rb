require "test_helper"

class Maps::OfflineSitesControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @map.memberships.create!(user: users(:bob), role: "editor")
  end

  def ready_site(include_networks: false)
    site = MapOfflineSite.create!(map: @map, requested_by: users(:michael), status: "ready", finished_at: Time.current, include_networks:,
      summary: { "photos" => 2, "videos" => 0, "documents" => 1, "tiles" => 40, "skipped" => [] })
    site.archive.attach(io: StringIO.new("PK"), filename: site.filename, content_type: "application/zip")
    site
  end

  test "says there is nothing yet, and whether networks may be included" do
    sign_in_as users(:alice)
    get map_offline_site_path(@map)
    assert_response :success
    assert_equal({ "status" => "none", "canIncludeNetworks" => false }, response.parsed_body)
  end

  test "every role may ask for the site, read-only and archived maps too" do
    @map.archive!
    sign_in_as users(:alice)
    assert_enqueued_with(job: OfflineSiteJob) { post map_offline_site_path(@map) }
    assert_response :accepted
    assert_equal "pending", response.parsed_body["status"]
    assert_not @map.offline_site.include_networks
  end

  test "networks only for owners and editors who ask" do
    sign_in_as users(:alice)
    post map_offline_site_path(@map, networks: "1")
    assert_not @map.reload.offline_site.include_networks

    sign_in_as users(:bob)
    post map_offline_site_path(@map, networks: "1")
    assert @map.reload.offline_site.include_networks
  end

  test "download sends the zip once it is ready" do
    sign_in_as users(:alice)
    get download_map_offline_site_path(@map)
    assert_response :not_found

    ready_site
    get map_offline_site_path(@map)
    assert_equal "ready", response.parsed_body["status"]
    assert_equal 2, response.parsed_body["byteSize"]
    get download_map_offline_site_path(@map)
    assert_response :redirect
  end

  test "a site with the networks stays with owners and editors" do
    ready_site(include_networks: true)
    sign_in_as users(:alice)
    get map_offline_site_path(@map)
    assert_equal "none", response.parsed_body["status"]
    get download_map_offline_site_path(@map)
    assert_response :forbidden

    sign_in_as users(:bob)
    get download_map_offline_site_path(@map)
    assert_response :redirect
  end

  test "strangers get nothing" do
    sign_in_as users(:bob)
    other = Map.create!(name: "Ailleurs", owner: users(:alice), region: regions(:wallonia))
    get map_offline_site_path(other)
    assert_response :not_found
    post map_offline_site_path(other)
    assert_response :not_found
  end
end
