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
    # The page's own URL carries a random token, which may spell « gaz ».
    page = response.body.gsub(@publication.token, "")
    %w[Conduite gaz Verger Yvoir 91005A0012 privées].each do |leak|
      assert_not_includes page, leak, "#{leak} leaked in the public page"
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

  test "the link preview: the map's own title and summary, and its painted image once there is one" do
    get public_map_path(@publication.token), headers: inertia_headers
    by_key = props["_inertia_meta"].index_by { |tag| tag["headKey"] }
    assert_equal "Le projet", by_key.dig("og:title", "content")
    assert_equal "Pour le client", by_key.dig("og:description", "content")
    assert_equal "http://www.example.com/og-image.png", by_key.dig("og:image", "content")

    @publication.preview_image.attach(io: StringIO.new("png"), filename: "p.png", content_type: "image/png")
    get public_map_path(@publication.token), headers: inertia_headers
    by_key = props["_inertia_meta"].index_by { |tag| tag["headKey"] }
    assert_equal "http://www.example.com/p/#{@publication.token}/preview.png?v=1", by_key.dig("og:image", "content")
    assert_equal "1200", by_key.dig("og:image:width", "content")
  end

  test "without a presentation, the preview says what the garden is, never the hidden address" do
    @publication.update!(description: nil)
    get public_map_path(@publication.token), headers: inertia_headers
    description = props["_inertia_meta"].find { |tag| tag["headKey"] == "og:description" }["content"]
    assert_match(/jardin-forêt/, description)
    assert_not_includes description, "Yvoir"

    MapPublication.publish!(@map, by: @owner, options: { "hide_address" => false })
    @publication.reload.update!(description: nil)
    get public_map_path(@publication.token), headers: inertia_headers
    description = props["_inertia_meta"].find { |tag| tag["headKey"] == "og:description" }["content"]
    assert_match(/\AYvoir · /, description)
    assert_equal "Yvoir", props["map"]["locality"]
  end

  test "the published plants grow on the years bar, without their own names or numbers" do
    @map.features.create!(layer: "plants", kind: "plant", name: "Le pommier de Lily", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2025-11-20", "number" => 4 })
    MapPublication.publish!(@map, by: @owner)
    get public_map_path(@publication.token), headers: inertia_headers
    growth = props["growth"]
    assert_equal "2025-11-20", growth["origin"]
    apple = growth["plants"].find { |plant| plant["speciesId"] == plant_species(:apple).id }
    assert_equal "sub_canopy", apple["strata"]
    assert_not apple.key?("ownName")
    assert_not apple.key?("number")
    # Only in the feature itself (its name is part of the published layer).
    assert_equal 1, response.body.scan("Le pommier de Lily").size

    MapPublication.publish!(@map, by: @owner, options: { "feature_layers" => %w[water] })
    get public_map_path(@publication.token), headers: inertia_headers
    assert_nil props["growth"], "plants hidden: no growth either"
  end

  test "visits are counted once per browser, never the map's people nor link preview robots" do
    get public_map_path(@publication.token), headers: inertia_headers
    get public_map_path(@publication.token), headers: inertia_headers
    assert_equal 1, @publication.reload.views_count
    assert_equal @publication.token, props["token"]

    get public_map_path(@publication.token), headers: { "User-Agent" => "WhatsApp/2.23" }
    assert_equal 1, @publication.reload.views_count

    sign_in_as @owner
    get public_map_path(@publication.token)
    assert_equal 1, @publication.reload.views_count
  end

  test "an account made after a visit remembers the map; the owner sees the numbers" do
    get public_map_path(@publication.token)
    user = User.create!(email_address: "curieuse@example.org")
    post magic_link_path(user.generate_token_for(:magic_link))
    assert_equal @publication, user.reload.source_publication
    assert_equal [ { "event" => "signup", "props" => { "via" => "public_map" } } ], flash[:inertia]["track"]

    assert_equal({ views: 1, gardensStarted: 1 }, @publication.reload.as_inertia.slice(:views, :gardensStarted))
  end
end
