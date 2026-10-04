require "test_helper"
require_relative "../test_helpers/drone_test_helper"

# A published map (/p/:token) shows the newest drone view only when the
# owner ticks « Vue drone » in the « Publier » panel; it is off by default.
class DronePublicationTest < ActionDispatch::IntegrationTest
  include DroneTestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @older = aerial_view(@map, captured_on: Date.new(2026, 9, 3), kind: "xyz", url: XYZ_URL)
    @newer = aerial_view(@map, captured_on: Date.new(2027, 5, 12))
  end

  def publish(options = nil) = MapPublication.publish!(@map, by: @owner, title: "Le projet", options:)

  def public_props(publication)
    get public_map_path(publication.token), headers: inertia_headers
    assert_response :success
    response.parsed_body["props"]
  end

  test "off by default: no drone view in the snapshot nor in the public page" do
    publication = publish
    assert_equal false, publication.options["show_aerial_view"]
    assert_nil publication.snapshot["aerial_view_id"]
    assert_nil public_props(publication)["aerialView"]
    assert_not_includes response.body, "drone.example.org"
  end

  test "on request, the newest view is frozen in the snapshot and served to the public page" do
    publication = publish("show_aerial_view" => "1")
    assert_equal @newer.id, publication.snapshot["aerial_view_id"]
    view = public_props(publication)["aerialView"]
    assert_equal({ "id" => @newer.id, "capturedOn" => "2027-05-12", "kind" => "pmtiles", "url" => PMTILES_URL },
                 view.slice("id", "capturedOn", "kind", "url"))

    # A newer delivery does not change the published view until republished.
    newest = aerial_view(@map, captured_on: Date.new(2027, 9, 1), url: "https://drone.example.org/ahinvaux-2027-09-01.pmtiles")
    assert_equal @newer.id, public_props(publication.reload)["aerialView"]["id"]
    assert_equal newest.id, publish.snapshot["aerial_view_id"], "republishing keeps the option and takes the newest view"
  end

  test "a view removed by staff disappears from the public page; switching the option off hides it" do
    publication = publish("show_aerial_view" => true)
    @newer.destroy!
    assert_nil public_props(publication.reload)["aerialView"]

    publication = publish("show_aerial_view" => true)
    assert_equal @older.id, publication.aerial_view.id
    publication.update!(options: publication.options.merge("show_aerial_view" => false))
    assert_nil publication.aerial_view
  end

  test "the « Publier » panel offers the option only with a view, and says which one" do
    sign_in_as @owner
    get map_publication_path(@map), as: :json
    assert_equal false, response.parsed_body.dig("defaults", "options", "show_aerial_view")
    assert_equal({ "name" => "Vue drone", "capturedOn" => "2027-05-12" }, response.parsed_body["aerialView"])

    post map_publication_path(@map), params: { publication: { title: "Le projet", options: { show_aerial_view: true } } }, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.dig("publication", "options", "show_aerial_view")

    @map.aerial_views.destroy_all
    get map_publication_path(@map), as: :json
    assert_nil response.parsed_body["aerialView"]
  end
end
