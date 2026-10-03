require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class PublicMapsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @map.update!(address: "Rue du Verger 12, 5530 Yvoir", parcels: [ "91005A0012/00B000" ], description: "Notes privées de Michael")
    with_feature(@map, name: "Noyer")
    with_feature(@map, layer: "networks", kind: "line", name: "Conduite de gaz",
                 geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.340 ], [ 4.906, 50.341 ] ] })
    @publication = MapPublication.publish!(@map, by: @owner, title: "Le projet", description: "Pour le client")
  end

  def props(response_body = response.body) = JSON.parse(response_body)["props"]

  test "no account needed: the published view renders the snapshot" do
    get public_map_path(@publication.token), headers: inertia_headers
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "public_maps/show", body["component"]
    assert_equal "Le projet", body["props"]["title"]
    assert_equal "MultiPolygon", body["props"]["map"]["boundary"]["type"]
    assert_equal [ "Mare du verger", "Noyer" ].sort, body["props"]["features"]["features"].map { |f| f["properties"]["name"] }.sort
    assert_nil body["props"]["currentUser"]
    assert_match(/noindex/, response.headers["X-Robots-Tag"])
  end

  test "nothing private reaches the response: networks, address, parcels, notes, e-mails" do
    get public_map_path(@publication.token), headers: inertia_headers
    %w[Conduite gaz Verger Yvoir 91005A0012 privées].each do |leak|
      assert_not_includes response.body, leak, "#{leak} leaked in the public page"
    end
    assert_not_includes response.body, @owner.email_address
    assert_not_includes response.body, "michael@"
    assert_not_includes response.body, "ownerName"
    assert_not_includes response.body, "email"
  end

  test "address is shown only when the owner chose so" do
    MapPublication.publish!(@map, by: @owner, options: { "hide_address" => false })
    get public_map_path(@publication.reload.token), headers: inertia_headers
    assert_equal "Rue du Verger 12, 5530 Yvoir", props["map"]["address"]
  end

  test "the view is a snapshot: later edits stay private until published again" do
    @map.features.find_by!(name: "Noyer").update!(name: "Chantier secret")
    @map.update!(name: "Nouveau nom")
    get public_map_path(@publication.token), headers: inertia_headers
    assert_includes response.body, "Noyer"
    assert_not_includes response.body, "Chantier secret"
    assert_equal "Le projet", props["title"]
  end

  test "unpublished: a French 410 page, and the content is gone" do
    @publication.unpublish!
    get public_map_path(@publication.token), headers: inertia_headers
    assert_response :gone
    body = JSON.parse(response.body)
    assert_equal "public_maps/gone", body["component"]
    assert_not_includes response.body, "Noyer"
    assert_nil body["props"]["features"]
  end

  test "unknown address: 404" do
    get public_map_path("pas-une-carte-publiee"), headers: inertia_headers
    assert_response :not_found
  end

  test "tokens are not guessable from the map id" do
    get "/p/#{@map.id}", headers: inertia_headers
    assert_response :not_found
  end

  test "signed-in visitors see the same read-only view" do
    sign_in_as @owner
    get public_map_path(@publication.token), headers: inertia_headers
    assert_response :success
    assert_equal "public_maps/show", JSON.parse(response.body)["component"]
  end
end
