require "test_helper"
require "test_helpers/mcp_test_helper"

# End to end: discovery → dynamic registration → consent → code + PKCE →
# token → MCP call → refresh rotation → revocation.
class OauthFlowTest < ActionDispatch::IntegrationTest
  REDIRECT = "https://claude.ai/api/mcp/auth_callback".freeze

  setup do
    @verifier = SecureRandom.urlsafe_base64(48)
    @challenge = Base64.urlsafe_encode64(OpenSSL::Digest::SHA256.digest(@verifier), padding: false)
  end

  test "discovery documents" do
    get "/.well-known/oauth-protected-resource/mcp"
    assert_response :success
    assert_equal "http://www.example.com/mcp", response.parsed_body["resource"]
    assert_equal [ "http://www.example.com" ], response.parsed_body["authorization_servers"]
    get "/.well-known/oauth-protected-resource"
    assert_response :success

    get "/.well-known/oauth-authorization-server"
    assert_response :success
    metadata = response.parsed_body
    assert_equal "http://www.example.com", metadata["issuer"]
    assert_equal "http://www.example.com/oauth/register", metadata["registration_endpoint"]
    assert_equal [ "S256" ], metadata["code_challenge_methods_supported"]
    assert_includes metadata["token_endpoint_auth_methods_supported"], "none"
  end

  test "full flow for a public client, then refresh rotation and reuse detection" do
    client_id = register(token_endpoint_auth_method: "none")["client_id"]

    # Not signed in: the consent page sends to sign in first, then back.
    get "/oauth/authorize", params: authorize_params(client_id)
    assert_redirected_to new_session_path

    sign_in_as users(:michael)
    get "/oauth/authorize", params: authorize_params(client_id), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "oauth/authorize", page["component"]
    assert_equal "Claude", page.dig("props", "client", "name")
    assert_equal "claude.ai", page.dig("props", "client", "redirectHost")
    assert_equal "drafts", page.dig("props", "requestedAccess")

    post "/oauth/authorize", params: authorize_params(client_id).merge(decision: "approve", access: "read")
    location = URI.parse(response.location)
    assert_equal "claude.ai", location.host
    query = Rack::Utils.parse_query(location.query)
    assert_equal "xyz", query["state"]
    assert_equal "http://www.example.com", query["iss"]
    code = query.fetch("code")

    # Wrong verifier fails, right one succeeds; the code is single use.
    post "/oauth/token", params: { grant_type: "authorization_code", code:, client_id:, redirect_uri: REDIRECT, code_verifier: "x" * 43 }
    assert_response :bad_request
    assert_equal "invalid_grant", response.parsed_body["error"]

    post "/oauth/token", params: { grant_type: "authorization_code", code:, client_id:, redirect_uri: REDIRECT, code_verifier: @verifier, resource: "http://www.example.com/mcp" }
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    tokens = response.parsed_body
    assert_equal "Bearer", tokens["token_type"]
    assert_equal "maps:read", tokens["scope"]
    assert tokens["access_token"].start_with?("sda_")

    # The access token works on the MCP endpoint, read only.
    sign_out
    text, error = call_tool(tokens["access_token"], "list_maps")
    refute error
    assert_equal [ "Domaine d'Ahinvaux" ], text["maps"].map { |m| m["name"] }
    assert_equal "Claude", AiAction.last.client_name
    assert_equal "oauth", AiAction.last.credential_type
    text, error = call_tool(tokens["access_token"], "propose_features", { map_id: maps(:ahinvaux).id, features: [] })
    assert error

    # Refresh rotates; the old refresh token is then refused and kills the family.
    post "/oauth/token", params: { grant_type: "refresh_token", refresh_token: tokens["refresh_token"], client_id: }
    assert_response :success
    rotated = response.parsed_body
    refute_equal tokens["refresh_token"], rotated["refresh_token"]
    mcp_request(tokens["access_token"], "tools/list")
    assert_response :unauthorized

    post "/oauth/token", params: { grant_type: "refresh_token", refresh_token: tokens["refresh_token"], client_id: }
    assert_response :bad_request
    mcp_request(rotated["access_token"], "tools/list")
    assert_response :unauthorized
  end

  test "a replayed authorization code revokes the tokens it gave" do
    client_id = register(token_endpoint_auth_method: "none")["client_id"]
    sign_in_as users(:michael)
    post "/oauth/authorize", params: authorize_params(client_id).merge(decision: "approve", access: "drafts")
    code = Rack::Utils.parse_query(URI.parse(response.location).query).fetch("code")
    sign_out

    post "/oauth/token", params: { grant_type: "authorization_code", code:, client_id:, code_verifier: @verifier }
    tokens = response.parsed_body
    post "/oauth/token", params: { grant_type: "refresh_token", refresh_token: tokens["refresh_token"], client_id: }
    rotated = response.parsed_body
    mcp_request(rotated["access_token"], "tools/list")
    assert_response :success

    post "/oauth/token", params: { grant_type: "authorization_code", code:, client_id:, code_verifier: @verifier }
    assert_response :bad_request
    mcp_request(rotated["access_token"], "tools/list")
    assert_response :unauthorized
  end

  test "confidential client with client_secret_basic, drafts access, revocation" do
    registration = register(token_endpoint_auth_method: "client_secret_basic")
    client_id = registration["client_id"]
    secret = registration.fetch("client_secret")

    sign_in_as users(:michael)
    post "/oauth/authorize", params: authorize_params(client_id).merge(decision: "approve", access: "drafts")
    code = Rack::Utils.parse_query(URI.parse(response.location).query).fetch("code")
    sign_out

    post "/oauth/token", params: { grant_type: "authorization_code", code:, redirect_uri: REDIRECT, code_verifier: @verifier }
    assert_response :unauthorized
    assert_equal "invalid_client", response.parsed_body["error"]

    basic = ActionController::HttpAuthentication::Basic.encode_credentials(client_id, secret)
    post "/oauth/token", params: { grant_type: "authorization_code", code:, redirect_uri: REDIRECT, code_verifier: @verifier },
      headers: { "Authorization" => basic }
    assert_response :success
    tokens = response.parsed_body
    assert_equal "maps:read maps:drafts", tokens["scope"]

    _, error = call_tool(tokens["access_token"], "get_map", { map_id: maps(:ahinvaux).id })
    refute error

    post "/oauth/revoke", params: { token: tokens["refresh_token"] }, headers: { "Authorization" => basic }
    assert_response :ok
    mcp_request(tokens["access_token"], "tools/list")
    assert_response :unauthorized
  end

  test "the user can deny" do
    client_id = register(token_endpoint_auth_method: "none")["client_id"]
    sign_in_as users(:michael)
    post "/oauth/authorize", params: authorize_params(client_id).merge(decision: "deny")
    query = Rack::Utils.parse_query(URI.parse(response.location).query)
    assert_equal "access_denied", query["error"]
    assert_nil query["code"]
  end

  test "authorization errors: unknown client and foreign redirect stay on our page, PKCE missing goes back" do
    client_id = register(token_endpoint_auth_method: "none")["client_id"]
    sign_in_as users(:michael)

    get "/oauth/authorize", params: authorize_params("nope"), headers: inertia_headers
    assert_response :bad_request
    assert_equal "oauth/error", response.parsed_body["component"]

    get "/oauth/authorize", params: authorize_params(client_id).merge(redirect_uri: "https://evil.example/cb"), headers: inertia_headers
    assert_response :bad_request

    get "/oauth/authorize", params: authorize_params(client_id).except(:code_challenge)
    query = Rack::Utils.parse_query(URI.parse(response.location).query)
    assert_equal "invalid_request", query["error"]

    get "/oauth/authorize", params: authorize_params(client_id).merge(resource: "https://other.example/mcp")
    assert_equal "invalid_target", Rack::Utils.parse_query(URI.parse(response.location).query)["error"]
  end

  test "registration validates redirect URIs" do
    post "/oauth/register", params: { client_name: "Bad", redirect_uris: [ "http://evil.example/cb" ] }.to_json,
      headers: { "Content-Type" => "application/json" }
    assert_response :bad_request
    assert_equal "invalid_redirect_uri", response.parsed_body["error"]

    post "/oauth/register", params: { client_name: "Claude Code", redirect_uris: [ "http://localhost:53682/callback" ], token_endpoint_auth_method: "none" }.to_json,
      headers: { "Content-Type" => "application/json" }
    assert_response :created
    assert_nil response.parsed_body["client_secret"]
    client = OauthClient.find_by!(client_id: response.parsed_body["client_id"])
    assert client.redirect_uri_allowed?("http://localhost:61000/callback"), "loopback port may change"
    refute client.redirect_uri_allowed?("http://localhost:61000/other")
  end

  private
    def register(**metadata)
      post "/oauth/register",
        params: { client_name: "Claude", redirect_uris: [ REDIRECT ], grant_types: %w[authorization_code refresh_token], response_types: %w[code] }.merge(metadata).to_json,
        headers: { "Content-Type" => "application/json" }
      assert_response :created
      response.parsed_body
    end

    def authorize_params(client_id)
      {
        response_type: "code", client_id:, redirect_uri: REDIRECT, state: "xyz",
        code_challenge: @challenge, code_challenge_method: "S256",
        scope: "maps:read maps:drafts", resource: "http://www.example.com/mcp"
      }
    end
end
