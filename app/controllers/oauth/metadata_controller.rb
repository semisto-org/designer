# OAuth discovery documents for MCP clients: authorization server metadata
# (RFC 8414) and protected resource metadata of the MCP endpoint (RFC 9728),
# served both at the root and with the /mcp path suffix.
module Oauth
  class MetadataController < ActionController::API
    include AgentApi

    def authorization_server
      expires_in 1.hour, public: true
      render json: Mcp::Endpoints.authorization_server_metadata(origin)
    end

    def protected_resource
      expires_in 1.hour, public: true
      render json: Mcp::Endpoints.protected_resource_metadata(origin)
    end
  end
end
