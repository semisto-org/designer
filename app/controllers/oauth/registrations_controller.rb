# OAuth 2.0 dynamic client registration (RFC 7591): how claude.ai, Claude
# Desktop and other MCP clients register themselves before asking the user.
module Oauth
  class RegistrationsController < ActionController::API
    include AgentApi

    rate_limit to: 30, within: 1.minute, with: -> { render json: { error: "slow_down" }, status: :too_many_requests },
      store: AgentApi::RATE_LIMIT_STORE, only: :create

    def create
      metadata = JSON.parse(request.raw_post.presence || "{}")
      return registration_error("invalid_client_metadata", "Expected a JSON object") unless metadata.is_a?(Hash)
      client = OauthClient.register!(metadata)
      no_store!
      render json: client.registration_response, status: :created
    rescue JSON::ParserError
      registration_error("invalid_client_metadata", "Invalid JSON")
    rescue OauthClient::RegistrationError => e
      registration_error(e.code, e.message)
    end

    private
      def registration_error(error, description)
        no_store!
        render json: { error:, error_description: description }, status: :bad_request
      end
  end
end
