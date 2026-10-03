require "test_helper"

class Account::AiControllerTest < ActionDispatch::IntegrationTest
  test "requires sign in" do
    get account_ai_path
    assert_redirected_to new_session_path
  end

  test "shows the connector URL, authorized apps and tokens" do
    user = users(:michael)
    client = OauthClient.create!(name: "Claude", redirect_uris: [ "https://claude.ai/api/mcp/auth_callback" ], token_endpoint_auth_method: "none")
    OauthAccessToken.issue!(user:, client:, scopes: "maps:read maps:drafts", resource: "http://www.example.com/mcp")
    ApiToken.create!(user:, name: "Script", access: "read")
    ApiToken.create!(user:, name: "Ancien", access: "read").revoke!

    sign_in_as user
    get account_ai_path, headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "account/ai", response.parsed_body["component"]
    assert_equal "http://www.example.com/mcp", props.dig("endpoints", "mcp")
    assert_equal [ [ "Claude", "drafts" ] ], props["apps"].map { |a| a.values_at("name", "access") }
    assert_equal [ "Script" ], props["tokens"].map { |t| t["name"] }
    refute props["tokens"].first.key?("plaintext")
  end

  test "creates a token shown once, then revokes it" do
    sign_in_as users(:michael)
    post account_api_tokens_path, params: { api_token: { name: "Claude Code", access: "drafts", expires_in: "90" } }, as: :json
    assert_response :created
    plaintext = response.parsed_body["plaintext"]
    assert plaintext.start_with?("sdp_")
    token = ApiToken.authenticate(plaintext)
    assert_equal [ "Claude Code", "drafts" ], [ token.name, token.access ]
    assert_in_delta 90.days.from_now, token.expires_at, 1.minute

    post account_api_tokens_path, params: { api_token: { name: "" } }, as: :json
    assert_response :unprocessable_entity

    delete account_api_token_path(token)
    assert_redirected_to account_ai_path
    assert_nil ApiToken.authenticate(plaintext)
  end

  test "cannot revoke the token of someone else" do
    token = ApiToken.create!(user: users(:alice), name: "Alice", access: "read")
    sign_in_as users(:michael)
    delete account_api_token_path(token)
    assert_response :not_found
    refute token.reload.revoked?
  end

  test "revokes an authorized app" do
    user = users(:michael)
    client = OauthClient.create!(name: "Claude", redirect_uris: [ "https://claude.ai/cb" ], token_endpoint_auth_method: "none")
    token = OauthAccessToken.issue!(user:, client:, scopes: "maps:read", resource: nil)
    other = OauthAccessToken.issue!(user: users(:alice), client:, scopes: "maps:read", resource: nil)
    sign_in_as user
    delete account_oauth_app_path(client)
    assert_redirected_to account_ai_path
    assert token.reload.revoked?
    refute other.reload.revoked?
  end
end
