module Mcp
  # Builds the MCP server for one authenticated request. The server is
  # stateless: every POST carries its own bearer token, so a fresh server
  # per request keeps the principal out of any shared state.
  module ServerFactory
    VERSION = "1.0.0"

    def self.build(principal:, origin:)
      MCP::Server.new(
        name: "semisto-designer",
        title: "Semisto Designer",
        version: VERSION,
        website_url: Endpoints.all(origin)[:docs],
        instructions: I18n.t("mcp.server.instructions"),
        tools: Tools.all,
        server_context: { principal:, origin: },
        capabilities: { tools: { listChanged: false } }
      )
    end
  end
end
