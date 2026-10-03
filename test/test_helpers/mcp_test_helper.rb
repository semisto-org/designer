# Helpers for the MCP server tests: personal tokens, JSON-RPC calls on
# POST /mcp, editors, billing switched on (free plan for everyone).
module McpTestHelper
  MCP_HEADERS = {
    "Content-Type" => "application/json",
    "Accept" => "application/json, text/event-stream",
    "MCP-Protocol-Version" => "2025-06-18"
  }.freeze

  def personal_token(user, access: "drafts", **attributes)
    token = ApiToken.create!(user:, name: "Claude Code", access:, **attributes)
    token.plaintext
  end

  def mcp_request(token, method, params = {}, id: 1)
    headers = MCP_HEADERS.merge(token ? { "Authorization" => "Bearer #{token}" } : {})
    post("/mcp", params: { jsonrpc: "2.0", id:, method:, params: }.to_json, headers:)
    response.parsed_body
  end

  # Calls a tool; returns [structured result or error text, error?].
  def call_tool(token, name, arguments = {})
    body = mcp_request(token, "tools/call", { name:, arguments: })
    result = body.fetch("result") { flunk("JSON-RPC error: #{body['error'].inspect}") }
    if result["isError"]
      [ result["content"].first["text"], true ]
    else
      [ result["structuredContent"], false ]
    end
  end

  def make_editor(map, user)
    map.memberships.create!(user:, role: "editor")
  end

  def with_billing
    previous = ENV["STRIPE_SECRET_KEY"]
    ENV["STRIPE_SECRET_KEY"] = "sk_test_123"
    yield
  ensure
    ENV["STRIPE_SECRET_KEY"] = previous
  end

  def inside_square
    square(lng: 4.905, lat: 50.3405, size: 0.0005)
  end
end

ActiveSupport.on_load(:action_dispatch_integration_test) { include McpTestHelper }
