module Mcp
  # Public URLs of the MCP server and of its OAuth 2.1 authorization server.
  # Production answers on AppHosts.primary (APP_HOST, terranova.semisto.org
  # by default), and on an old host (designer.semisto.org) for a request
  # made there: a connector set up before the move keeps a consistent
  # server, issuer and resource, and its tokens stay valid. Local
  # environments use the host of the request.
  module Endpoints
    def self.origin(request = nil)
      if ENV["APP_HOST"].present? || Rails.env.production?
        host = request && AppHosts.legacy?(request.host) ? request.host : AppHosts.primary
        "https://#{host}"
      else
        request&.base_url || "http://localhost:3000"
      end
    end

    def self.resource(origin) = "#{origin}/mcp"

    def self.all(origin)
      {
        mcp: resource(origin),
        authorizationServerMetadata: "#{origin}/.well-known/oauth-authorization-server",
        protectedResourceMetadata: "#{origin}/.well-known/oauth-protected-resource/mcp",
        register: "#{origin}/oauth/register",
        authorize: "#{origin}/oauth/authorize",
        token: "#{origin}/oauth/token",
        revoke: "#{origin}/oauth/revoke",
        docs: "#{origin}/docs/mcp",
        account: "#{origin}/account/ai"
      }
    end

    # RFC 8414 authorization server metadata.
    def self.authorization_server_metadata(origin)
      urls = all(origin)
      {
        issuer: origin,
        authorization_endpoint: urls[:authorize],
        token_endpoint: urls[:token],
        registration_endpoint: urls[:register],
        revocation_endpoint: urls[:revoke],
        scopes_supported: AiAccess::SCOPES,
        response_types_supported: OauthClient::RESPONSE_TYPES,
        response_modes_supported: %w[query],
        grant_types_supported: OauthClient::GRANT_TYPES,
        token_endpoint_auth_methods_supported: OauthClient::AUTH_METHODS,
        revocation_endpoint_auth_methods_supported: OauthClient::AUTH_METHODS,
        code_challenge_methods_supported: %w[S256],
        authorization_response_iss_parameter_supported: true,
        service_documentation: urls[:docs],
        ui_locales_supported: %w[fr]
      }
    end

    # RFC 9728 protected resource metadata of the MCP endpoint.
    def self.protected_resource_metadata(origin)
      urls = all(origin)
      {
        resource: urls[:mcp],
        authorization_servers: [ origin ],
        scopes_supported: AiAccess::SCOPES,
        bearer_methods_supported: %w[header],
        resource_name: "Semisto Terranova",
        resource_documentation: urls[:docs]
      }
    end

    # The MCP resource a client names in `resource` (RFC 8707), tolerant of
    # a trailing slash.
    def self.same_resource?(value, origin)
      value.to_s.chomp("/") == resource(origin)
    end
  end
end
