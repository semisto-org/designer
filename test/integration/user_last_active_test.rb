require "test_helper"
require_relative "../test_helpers/mcp_test_helper"

# « Dernière activité »: a page, the phone app and the MCP all count; an admin
# signed in as someone does not.
class UserLastActiveIntegrationTest < ActionDispatch::IntegrationTest
  include McpTestHelper

  setup do
    @user = users(:bob)
    @user.update_column(:last_active_at, nil)
  end

  test "a page in the browser marks the person active" do
    sign_in_as @user
    get maps_path
    assert_not_nil @user.reload.last_active_at
  end

  test "an admin signed in as the person does not" do
    session = @user.sessions.create!(impersonator: users(:michael))
    cookie_jar = ActionDispatch::TestRequest.create.cookie_jar
    cookie_jar.signed[:session_id] = session.id
    cookies["session_id"] = cookie_jar[:session_id]
    get maps_path
    assert_nil @user.reload.last_active_at
  end

  test "an MCP call marks the person active" do
    mcp_request(personal_token(@user), "tools/list")
    assert_not_nil @user.reload.last_active_at
  end

  test "the phone app marks the person active" do
    token = OauthAccessToken.issue!(user: @user, client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil).plaintext_token
    post "/api/v1/push_devices", params: { token: "ExponentPushToken[abc]", platform: "ios" }, headers: { "Authorization" => "Bearer #{token}" }, as: :json
    assert_response :created
    assert_not_nil @user.reload.last_active_at
  end
end
