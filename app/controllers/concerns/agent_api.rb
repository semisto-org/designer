# Shared by the endpoints MCP clients call directly (the MCP server, OAuth
# metadata, registration, token, revocation): no cookies, no CSRF, bearer
# or client credentials only, so any origin may call them (CORS *), which
# browser-based MCP clients (MCP Inspector…) need.
module AgentApi
  extend ActiveSupport::Concern

  CORS_HEADERS = {
    "access-control-allow-origin" => "*",
    "access-control-allow-methods" => "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers" => "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID",
    "access-control-expose-headers" => "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
    "access-control-max-age" => "86400"
  }.freeze

  # Rate limits are counted in the app cache (Solid Cache in production).
  # Tests use the null cache store, so they get their own memory store.
  RATE_LIMIT_STORE = Rails.env.test? ? ActiveSupport::Cache::MemoryStore.new : Rails.cache

  included do
    prepend_before_action :add_cors_headers
  end

  # OPTIONS preflight.
  def preflight
    add_cors_headers
    head :no_content
  end

  private
    def add_cors_headers
      CORS_HEADERS.each { |name, value| response.headers[name] = value }
    end

    def origin = Mcp::Endpoints.origin(request)

    def no_store!
      response.headers["Cache-Control"] = "no-store"
      response.headers["Pragma"] = "no-cache"
    end
end
