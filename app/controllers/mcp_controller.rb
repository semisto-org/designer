# Remote MCP server (Streamable HTTP, stateless, JSON responses) at
# POST /mcp, built with the official Ruby SDK. Authenticated by a bearer
# token: an OAuth access token (claude.ai and Claude Desktop connectors,
# Claude Code) or a personal access token. Without one, the 401 points
# the client to the protected resource metadata, which starts OAuth.
class McpController < ActionController::API
  include AgentApi

  rate_limit to: 600, within: 1.minute, by: -> { request.remote_ip }, with: :too_many_requests,
    store: AgentApi::RATE_LIMIT_STORE, name: "ip", except: :preflight
  rate_limit to: 120, within: 1.minute, by: :credential_key, with: :too_many_requests,
    store: AgentApi::RATE_LIMIT_STORE, name: "credential", only: :create
  before_action :authenticate!, except: :preflight

  def create
    server = Mcp::ServerFactory.build(principal: @principal, origin:)
    transport = MCP::Server::Transports::StreamableHTTPTransport.new(
      server,
      stateless: true,
      enable_json_response: true,
      # Host checks are Rails' job (config.hosts); bearer tokens, not
      # cookies, protect this endpoint, so the Origin check is not needed.
      dns_rebinding_protection: false,
      serve_subscriptions_listen: false,
      max_request_bytes: 2.megabytes
    )
    server.transport = transport
    request.body.rewind if request.body.respond_to?(:rewind)
    status, headers, body = transport.handle_request(Rack::Request.new(request.env))
    headers.each { |name, value| response.headers[name] = value }
    self.status = status
    self.response_body = body
  end

  # The server keeps no session: no SSE stream to open, nothing to delete.
  def method_not_allowed
    response.headers["Allow"] = "POST"
    render json: { jsonrpc: "2.0", id: nil, error: { code: -32000, message: "Method not allowed: use POST" } }, status: :method_not_allowed
  end

  private
    def authenticate!
      @principal = Mcp::Authenticator.call(request.authorization, resource: Mcp::Endpoints.resource(origin))
      return if @principal
      error = Mcp::Authenticator.bearer(request.authorization) ? "invalid_token" : nil
      challenge = %(Bearer resource_metadata="#{Mcp::Endpoints.all(origin)[:protectedResourceMetadata]}", scope="#{AiAccess::SCOPES.join(' ')}")
      challenge += %(, error="invalid_token", error_description="The access token is invalid, expired or revoked") if error
      response.headers["WWW-Authenticate"] = challenge
      render json: { error: error || "unauthorized", error_description: I18n.t(error ? "mcp.errors.invalid_token" : "mcp.errors.unauthorized") },
        status: :unauthorized
    end

    def credential_key
      OpenSSL::Digest::SHA256.hexdigest(request.authorization.to_s).first(32)
    end

    def too_many_requests
      response.headers["Retry-After"] = "60"
      render json: { jsonrpc: "2.0", id: nil, error: { code: -32000, message: I18n.t("mcp.errors.rate_limited") } },
        status: :too_many_requests
    end
end
