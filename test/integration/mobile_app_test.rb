require "test_helper"
require "test_helpers/mcp_test_helper"

# Semisto's phone app: sign-in through OAuth (consent, code + PKCE, token
# with the APP scope), then its bearer token on the app's own endpoints and
# on the editor's JSON endpoints. No other token gets that far.
class MobileAppTest < ActionDispatch::IntegrationTest
  include McpTestHelper

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
    %w[layers features photos planting syncedAt mapEntitlements].each { |key| assert body.key?(key), key }

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

    def bearer(token) = { "Authorization" => "Bearer #{token}" }

    def with_forgery_protection
      previous = ActionController::Base.allow_forgery_protection
      ActionController::Base.allow_forgery_protection = true
      yield
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
end
