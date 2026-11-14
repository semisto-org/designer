require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/drone_test_helper"
require "test_helpers/teams_test_helper"

# Semisto's phone app: sign-in through OAuth (consent, code + PKCE, token
# with the APP scope), then its bearer token on the app's own endpoints and
# on the editor's JSON endpoints. No other token gets that far.
class MobileAppTest < ActionDispatch::IntegrationTest
  include McpTestHelper
  include DroneTestHelper
  include TeamsTestHelper

  setup do
    @verifier = SecureRandom.urlsafe_base64(48)
    @challenge = Base64.urlsafe_encode64(OpenSSL::Digest::SHA256.digest(@verifier), padding: false)
    @map = maps(:ahinvaux)
  end

  test "sign-in: consent page for the app, then a token with the app scope that rotates" do
    get "/oauth/authorize", params: authorize_params
    assert_redirected_to new_session_path

    sign_in_as users(:michael)
    get "/oauth/authorize", params: authorize_params, headers: inertia_headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("props", "mobileApp")

    # The access level radio of other clients means nothing here.
    post "/oauth/authorize", params: authorize_params.merge(decision: "approve", access: "read")
    location = URI.parse(response.location)
    assert_equal "org.semisto.designer", location.scheme
    code = Rack::Utils.parse_query(location.query).fetch("code")
    sign_out

    tokens = exchange(code)
    assert_equal "maps:read maps:drafts app", tokens["scope"]

    get "/api/v1/me", headers: bearer(tokens["access_token"])
    assert_response :success
    assert_equal "michael@example.org", response.parsed_body.dig("user", "email")

    post "/oauth/token", params: { grant_type: "refresh_token", refresh_token: tokens["refresh_token"], client_id: MobileApp::CLIENT_ID }
    assert_response :success
    rotated = response.parsed_body
    assert_equal "maps:read maps:drafts app", rotated["scope"]
    get "/api/v1/me", headers: bearer(tokens["access_token"])
    assert_response :unauthorized
    get "/api/v1/me", headers: bearer(rotated["access_token"])
    assert_response :success
  end

  test "magic link opened in another browser goes back to the app's authorization" do
    get "/oauth/authorize", params: authorize_params
    perform_enqueued_jobs { post session_path, params: { email_address: users(:michael).email_address } }
    link = ActionMailer::Base.deliveries.last.text_part.body.to_s[%r{https?://\S*/magic\S*}]
    assert link, "the e-mail carries the magic link"

    reset! # Safari: no cookie from the app's sign-in sheet
    get URI.parse(link).request_uri
    assert_response :success # the confirmation page; the button posts
    post URI.parse(link).request_uri
    location = URI.parse(response.location)
    assert_equal "/oauth/authorize", location.path
    assert_equal MobileApp::REDIRECT_URI, Rack::Utils.parse_query(location.query)["redirect_uri"]
  end

  test "a magic link never sends anyone to another site" do
    user = users(:michael)
    post magic_link_path(user.generate_token_for(:magic_link), return_to: "https://evil.example/oauth/authorize")
    assert_redirected_to root_url
    post magic_link_path(user.reload.generate_token_for(:magic_link), return_to: "//evil.example/x")
    assert_redirected_to root_url
  end

  test "denying sends the app an error, without a code" do
    sign_in_as users(:michael)
    post "/oauth/authorize", params: authorize_params.merge(decision: "deny")
    query = Rack::Utils.parse_query(URI.parse(response.location).query)
    assert_equal "access_denied", query["error"]
    assert_nil query["code"]
  end

  test "map list and offline bundle follow the user's maps and roles" do
    token = app_token(users(:alice))
    get "/api/v1/maps", headers: bearer(token)
    assert_response :success
    assert_equal [ [ @map.id, "viewer" ] ], response.parsed_body["maps"].map { |m| [ m["id"], m["role"] ] }

    get "/api/v1/maps/#{@map.id}", headers: bearer(token)
    assert_response :success
    body = response.parsed_body
    assert_equal @map.id, body.dig("map", "id")
    %w[layers features photos planting syncedAt mapEntitlements firstHour].each { |key| assert body.key?(key), key }

    get "/api/v1/maps/#{@map.id}", headers: bearer(app_token(users(:bob)))
    assert_response :not_found
  end

  test "style of a base map, for display and offline packs" do
    region = @map.region
    region.layers.create!(key: "ortho", name: "Orthophoto", group_name: "photos", category: "base", kind: "wms",
      url: "https://geoservices.wallonie.be/wms", layers: "0", proxied: true, enabled: true, options: { "default" => true })
    region.layers.create!(key: "plan", name: "Plan", group_name: "plan", category: "base", kind: "style",
      url: "https://tiles.openfreemap.org/styles/positron", proxied: false, enabled: true)
    token = app_token(users(:alice))

    get "/api/v1/maps/#{@map.id}/style", headers: bearer(token)
    assert_response :success
    style = response.parsed_body
    assert_equal 8, style["version"]
    assert_match %r{\Ahttp://www.example.com/regions/#{region.id}/layers/ortho/tiles/\{z\}/\{x\}/\{y\}}, style.dig("sources", "base", "tiles", 0)

    get "/api/v1/maps/#{@map.id}/style", params: { base: "plan" }, headers: bearer(token)
    assert_redirected_to "https://tiles.openfreemap.org/styles/positron"

    get "/api/v1/maps/#{@map.id}/style", headers: bearer(app_token(users(:bob)))
    assert_response :not_found
  end

  test "drone views: listed in the bundle, laid over the base map, tiles cut out of the archive" do
    region = @map.region
    region.layers.create!(key: "ortho", name: "Orthophoto", group_name: "photos", category: "base", kind: "wms",
      url: "https://geoservices.wallonie.be/wms", layers: "0", proxied: true, enabled: true)
    region.layers.create!(key: "plan", name: "Plan", group_name: "plan", category: "base", kind: "style",
      url: "https://tiles.openfreemap.org/styles/positron", proxied: false, enabled: true, options: { "default" => true })
    imported = @map.aerial_views.create!(name: "Printemps", captured_on: Date.new(2027, 5, 12), kind: "pmtiles", status: "ready",
      source_filename: "ortho.pmtiles", source_byte_size: 4813, min_zoom: 17, max_zoom: 18,
      bounds: { "west" => 4.874, "south" => 50.326, "east" => 4.876, "north" => 50.328 })
    imported.archive.attach(io: file_fixture("drone-view.pmtiles").open, filename: "ortho.pmtiles", content_type: "application/octet-stream")
    linked = aerial_view(@map, kind: "xyz", url: XYZ_URL, captured_on: Date.new(2026, 6, 1))
    aerial_view(@map, name: "En cours", status: "processing", source_filename: "b.tif", source_byte_size: 10, url: nil)
    token = app_token(users(:alice)) # a viewer

    get "/api/v1/maps/#{@map.id}", headers: bearer(token)
    assert_equal [ [ imported.id, "Printemps", "2027-05-12" ], [ linked.id, "Vue drone", "2026-06-01" ] ],
      response.parsed_body["aerialViews"].map { [ _1["id"], _1["name"], _1["capturedOn"] ] }

    # The default base is a whole style: the view goes over the tiled base instead.
    get "/api/v1/maps/#{@map.id}/style", params: { drone: imported.id }, headers: bearer(token)
    assert_response :success
    style = response.parsed_body
    assert_equal %w[background base drone], style["layers"].map { _1["id"] }
    assert_equal "http://www.example.com/api/v1/maps/#{@map.id}/aerial_views/#{imported.id}/tiles/{z}/{x}/{y}?v=#{imported.tiles_version}", style.dig("sources", "drone", "tiles", 0),
      "the archive's version: a realigned view gets new tile addresses"
    assert_equal [ 17, 18, [ 4.874, 50.326, 4.876, 50.328 ] ], style.dig("sources", "drone").values_at("minzoom", "maxzoom", "bounds")

    get "/api/v1/maps/#{@map.id}/style", params: { drone: linked.id, base: "ortho" }, headers: bearer(token)
    assert_equal XYZ_URL, response.parsed_body.dig("sources", "drone", "tiles", 0)

    get "/api/v1/maps/#{@map.id}/aerial_views/#{imported.id}/tiles/18/134622/88532", headers: bearer(token)
    assert_response :success
    assert_equal "image/webp", response.media_type
    assert response.body.b.start_with?("RIFF")
    get "/api/v1/maps/#{@map.id}/aerial_views/#{imported.id}/tiles/18/1/1", headers: bearer(token)
    assert_response :no_content

    get "/api/v1/maps/#{@map.id}/aerial_views/#{imported.id}/tiles/18/134622/88532", headers: bearer(app_token(users(:bob)))
    assert_response :not_found
    get "/api/v1/maps/#{@map.id}/aerial_views/#{imported.id}/tiles/18/134622/88532"
    assert_response :unauthorized
  end

  test "the token works on the editor's JSON endpoints, roles still apply, no CSRF token needed" do
    with_forgery_protection do
      feature = { layer: "notes", kind: "note", name: "Repère", geometry: { type: "Point", coordinates: [ 4.95, 50.32 ] } }
      post "/maps/#{@map.id}/features", params: { feature: }, headers: bearer(app_token(users(:michael))), as: :json
      assert_response :created

      post "/maps/#{@map.id}/features", params: { feature: }, headers: bearer(app_token(users(:alice))), as: :json
      assert_response :forbidden

      # A browser session still needs its CSRF token.
      sign_in_as users(:michael)
      post "/maps/#{@map.id}/features", params: { feature: }, as: :json
      assert_response :unprocessable_entity
    end
  end

  test "the map's discussion from the phone: a peek keeps it unread, a message sent twice is posted once" do
    token = app_token(users(:michael))
    Comment.create!(commentable: @map, author: users(:alice), body: "Les noyers ont gelé ?")
    get "/maps/#{@map.id}/comments", params: { commentable_type: "Map", commentable_id: @map.id, peek: 1 }, headers: bearer(token)
    assert_response :success
    assert_equal [ "Les noyers ont gelé ?" ], response.parsed_body["comments"].map { |c| c["body"] }
    assert_not CommentRead.exists?(user: users(:michael), commentable: @map), "peeking (pins, unread count) does not mark it read"

    message = { comment: { commentable_type: "Map", commentable_id: @map.id, body: "Oui, ici", feature_ids: [], lng: 4.91, lat: 50.35 } }
    headers = bearer(token).merge("Idempotency-Key" => "chat-1")
    assert_difference -> { @map.discussion_comments.count }, 1 do
      2.times { post "/maps/#{@map.id}/comments", params: message, headers:, as: :json }
    end
    assert_equal [ 4.91, 50.35 ], response.parsed_body["location"]

    get "/maps/#{@map.id}/comments", params: { commentable_type: "Map", commentable_id: @map.id }, headers: bearer(token)
    assert CommentRead.exists?(user: users(:michael), commentable: @map), "opening the discussion marks it read"
  end

  test "after a site visit: the bundle carries the timesheet for the project's team, and the hours are noted once" do
    assert_nil bundle_for(users(:michael))["timesheet"], "a personal map has no timesheet"

    @map.update!(organization: make_team("Semisto", admin: users(:michael), members: [ users(:bob) ]))
    users(:bob).time_entries.create!(map: @map, worked_on: Date.current - 3, minutes: 60, phase: "design", trip_km: 64, trip_from: "Yvoir", trip_to: "Erpent", source: "web")
    sheet = bundle_for(users(:bob))["timesheet"]
    assert_equal "design", sheet["defaultPhase"]
    assert_equal "Semisto", sheet["billTo"]
    assert_equal({ "km" => 64.0, "from" => "Yvoir", "to" => "Erpent" }, sheet["usualTrip"])
    assert_equal TimeEntry::PHASES, sheet["phases"]
    assert_nil bundle_for(users(:alice))["timesheet"], "never for the map's viewer"

    entry = { map_id: @map.id, worked_on: Date.current.iso8601, minutes: 105, phase: "design", billable: true, note: "Visite de terrain", trip_km: 64, trip_from: "Yvoir", trip_to: "Erpent" }
    headers = bearer(app_token(users(:bob))).merge("Idempotency-Key" => "time-1")
    assert_difference -> { users(:bob).time_entries.count }, 1 do
      2.times do
        post "/time_entries", params: { time_entry: entry, source: "app" }, headers:, as: :json
        assert_response :created
      end
    end
    noted = users(:bob).time_entries.order(:id).last
    assert_equal [ "app", 105, "Semisto" ], [ noted.source, noted.minutes, noted.bill_to ]
  end

  test "a change sent twice with the same Idempotency-Key is made once, and the first answer comes back" do
    token = app_token(users(:michael))
    feature = { layer: "notes", kind: "note", name: "Repère", geometry: { type: "Point", coordinates: [ 4.95, 50.32 ] } }
    headers = bearer(token).merge("Idempotency-Key" => "op-1")
    assert_difference -> { @map.features.count }, 1 do
      post "/maps/#{@map.id}/features", params: { feature: }, headers:, as: :json
      assert_response :created
      first = response.parsed_body["id"]
      post "/maps/#{@map.id}/features", params: { feature: }, headers:, as: :json
      assert_response :created
      assert_equal first, response.parsed_body["id"]
    end

    # Another key, or another person with the same key, is a new change.
    assert_difference -> { @map.features.count }, 1 do
      post "/maps/#{@map.id}/features", params: { feature: }, headers: bearer(token).merge("Idempotency-Key" => "op-2"), as: :json
    end
    # A refusal is not kept: the change can be sent again once allowed.
    post "/maps/#{@map.id}/features", params: { feature: }, headers: bearer(app_token(users(:alice))).merge("Idempotency-Key" => "op-1"), as: :json
    assert_response :forbidden
    assert_equal 2, IdempotentRequest.count
  end

  test "properties_patch changes only the properties it names" do
    feature = @map.features.create!(layer: "plants", kind: "plant", properties: { "note_from_web" => "garder" },
      geometry: { "type" => "Point", "coordinates" => [ 4.95, 50.32 ] })
    patch "/maps/#{@map.id}/features/#{feature.id}",
      params: { feature: { properties_patch: { planted_on: "2026-10-17" }, lock_version: feature.lock_version } },
      headers: bearer(app_token(users(:michael))), as: :json
    assert_response :success
    feature.reload
    assert_equal "2026-10-17", feature.properties["planted_on"]
    assert_equal "garder", feature.properties["note_from_web"]
  end

  test "no other credential is accepted as the app" do
    get "/api/v1/maps"
    assert_response :unauthorized

    get "/api/v1/maps", headers: bearer("sda_not_a_token")
    assert_response :unauthorized

    get "/api/v1/maps", headers: bearer(personal_token(users(:michael)))
    assert_response :unauthorized

    # Another OAuth client (Claude…) never gets the app scope.
    claude = OauthClient.register!(client_name: "Claude", redirect_uris: [ "https://claude.ai/api/mcp/auth_callback" ], token_endpoint_auth_method: "none")
    token = OauthAccessToken.issue!(user: users(:michael), client: claude, scopes: "maps:read maps:drafts app", resource: nil)
    get "/api/v1/maps", headers: bearer(token.plaintext_token)
    assert_response :unauthorized

    # Nor does a signed-in browser cookie reach these endpoints as a token would: it simply works as itself.
    sign_in_as users(:michael)
    get "/api/v1/maps"
    assert_response :success
  end

  test "a revoked app token stops working" do
    token = OauthAccessToken.issue!(user: users(:michael), client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil)
    get "/api/v1/me", headers: bearer(token.plaintext_token)
    assert_response :success
    post "/oauth/revoke", params: { token: token.plaintext_refresh_token, client_id: MobileApp::CLIENT_ID }
    get "/api/v1/me", headers: bearer(token.plaintext_token)
    assert_response :unauthorized
  end

  test "the app sends an account deletion request to Semisto" do
    token = app_token(users(:alice))
    assert_enqueued_emails 2 do
      post "/api/v1/me/deletion_request", headers: bearer(token)
    end
    assert_response :accepted

    post "/api/v1/me/deletion_request"
    assert_response :unauthorized
  end

  test "stores' reviewers sign in with their code, only when it is configured" do
    get "/session/new", headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "reviewAccess")
    post "/session/review", params: { email_address: "review@example.org", code: "anything-at-all-here" }
    assert_redirected_to new_session_path

    with_review_access do
      get "/session/new", headers: inertia_headers
      assert_equal true, response.parsed_body.dig("props", "reviewAccess")

      post "/session/review", params: { email_address: "review@example.org", code: "not-the-right-code" }
      assert_redirected_to new_session_path
      get "/api/v1/maps"
      assert_response :unauthorized

      post "/session/review", params: { email_address: "review@example.org", code: "a-long-review-code-1234" }
      get "/api/v1/maps"
      assert_response :success
      assert_equal "review@example.org", User.find_by(email_address: "review@example.org").email_address
    end
  end

  test "app_review:prepare gives the reviewers a demo map" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("app_review:prepare")
    with_review_access do
      assert_output(/Jardin-forêt de démonstration/) { Rake::Task["app_review:prepare"].execute }
      map = User.find_by!(email_address: "review@example.org").owned_maps.sole
      assert_equal 4, map.features.count
      assert_output(/Jardin-forêt/) { Rake::Task["app_review:prepare"].execute }
      assert_equal 4, map.features.count
    end
  end

  private
    def with_review_access
      previous = ENV.values_at("APP_REVIEW_EMAIL", "APP_REVIEW_CODE")
      ENV["APP_REVIEW_EMAIL"] = "review@example.org"
      ENV["APP_REVIEW_CODE"] = "a-long-review-code-1234"
      yield
    ensure
      ENV["APP_REVIEW_EMAIL"], ENV["APP_REVIEW_CODE"] = previous
    end

    def authorize_params
      {
        response_type: "code", client_id: MobileApp::CLIENT_ID, redirect_uri: MobileApp::REDIRECT_URI, state: "s1",
        code_challenge: @challenge, code_challenge_method: "S256"
      }
    end

    def exchange(code)
      post "/oauth/token", params: {
        grant_type: "authorization_code", code:, client_id: MobileApp::CLIENT_ID,
        redirect_uri: MobileApp::REDIRECT_URI, code_verifier: @verifier
      }
      assert_response :success
      response.parsed_body
    end

    def app_token(user)
      OauthAccessToken.issue!(user:, client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil).plaintext_token
    end

    def bundle_for(user)
      get "/api/v1/maps/#{@map.id}", headers: bearer(app_token(user))
      assert_response :success
      response.parsed_body
    end

    def bearer(token) = { "Authorization" => "Bearer #{token}" }

    def with_forgery_protection
      previous = ActionController::Base.allow_forgery_protection
      ActionController::Base.allow_forgery_protection = true
      yield
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
end
