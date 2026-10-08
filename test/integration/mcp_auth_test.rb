require "test_helper"
require "test_helpers/mcp_test_helper"

class McpAuthTest < ActionDispatch::IntegrationTest
  test "without a token: 401 pointing to the protected resource metadata" do
    post "/mcp", params: { jsonrpc: "2.0", id: 1, method: "tools/list" }.to_json, headers: McpTestHelper::MCP_HEADERS
    assert_response :unauthorized
    challenge = response.headers["WWW-Authenticate"]
    assert_match %r{\ABearer resource_metadata="http://www.example.com/.well-known/oauth-protected-resource/mcp"}, challenge
    assert_includes challenge, %(scope="maps:read maps:drafts")
    refute_includes challenge, "invalid_token"
    assert_equal "*", response.headers["access-control-allow-origin"]
  end

  test "an unknown token is rejected as invalid_token" do
    mcp_request("sdp_nope", "tools/list")
    assert_response :unauthorized
    assert_includes response.headers["WWW-Authenticate"], %(error="invalid_token")
  end

  test "a personal token initializes the session and lists the tools" do
    token = personal_token(users(:michael))
    body = mcp_request(token, "initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" }
    })
    assert_response :success
    assert_equal "semisto-designer", body.dig("result", "serverInfo", "name")
    assert_includes body.dig("result", "instructions"), "brouillons"
    assert_nil response.headers["Mcp-Session-Id"]

    body = mcp_request(token, "tools/list")
    names = body.dig("result", "tools").map { |t| t["name"] }
    assert_equal %w[list_maps get_map list_features get_feature get_region_layers identify_at_point get_site_data search_plants get_plant get_design_guide get_project_sheet propose_features propose_palette propose_project_sheet withdraw_draft], names
    propose = body.dig("result", "tools").find { |t| t["name"] == "propose_features" }
    assert_equal false, propose.dig("inputSchema", "additionalProperties")
    assert_equal false, propose.dig("annotations", "readOnlyHint")
    assert ApiToken.last.last_used_at.present?
  end

  test "revoked and expired tokens stop working" do
    token = personal_token(users(:michael))
    ApiToken.last.revoke!
    mcp_request(token, "tools/list")
    assert_response :unauthorized

    token = personal_token(users(:michael))
    ApiToken.last.update!(expires_at: 1.minute.ago)
    mcp_request(token, "tools/list")
    assert_response :unauthorized
  end

  test "strict input schemas reject unknown arguments" do
    token = personal_token(users(:michael))
    text, error = call_tool(token, "get_map", { map_id: maps(:ahinvaux).id, extra: 1 })
    assert error
    assert_match(/Invalid arguments/, text)
  end

  test "GET and DELETE are not allowed (stateless server)" do
    token = personal_token(users(:michael))
    get "/mcp", headers: { "Authorization" => "Bearer #{token}", "Accept" => "text/event-stream" }
    assert_response :method_not_allowed
    assert_equal "POST", response.headers["Allow"]
  end

  test "CORS preflight" do
    process :options, "/mcp", headers: { "Origin" => "http://localhost:6274", "Access-Control-Request-Method" => "POST" }
    assert_response :no_content
    assert_includes response.headers["access-control-allow-headers"], "Mcp-Protocol-Version"
  end

  test "rate limited per credential" do
    token = personal_token(users(:alice), access: "read")
    121.times { mcp_request(token, "ping") }
    assert_response :too_many_requests
    assert_equal "60", response.headers["Retry-After"]
  end
end
