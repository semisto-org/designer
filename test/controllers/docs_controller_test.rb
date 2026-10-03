require "test_helper"

class DocsControllerTest < ActionDispatch::IntegrationTest
  test "public MCP documentation generated from the tools" do
    get mcp_docs_path, headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "pages/docs/mcp", page["component"]
    tools = page.dig("props", "tools")
    assert_equal Mcp::Tools.all.map(&:name_value), tools.map { |t| t["name"] }
    propose = tools.find { |t| t["name"] == "propose_features" }
    assert_equal "propose", propose["requirement"]
    rationale = propose["parameters"].find { |p| p["name"] == "features[].rationale" }
    assert rationale["required"]
    assert_equal "http://www.example.com/mcp", page.dig("props", "endpoints", "mcp")
  end
end
