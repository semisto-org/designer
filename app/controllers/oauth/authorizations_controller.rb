# OAuth 2.1 authorization endpoint: the consent page where a signed-in
# user lets an MCP client (Claude…) read their maps, or read them and post
# drafts. Errors about the client or its redirect URI are shown here (never
# redirected to an unverified URI); the others go back to the client.
module Oauth
  class AuthorizationsController < ApplicationController
    before_action :load_client
    before_action :validate_request

    def new
      render inertia: "oauth/authorize", props: {
        client: {
          name: @client.name,
          redirectHost: host_label(@redirect_uri),
          clientUri: @client.metadata["client_uri"].to_s.start_with?("https://") ? @client.metadata["client_uri"] : nil
        },
        account: { name: Current.user.display_name, email: Current.user.email_address },
        requestedAccess: AiAccess.level(params[:scope].to_s),
        planAllowsDrafts: Current.user.entitlements.ai_drafts?,
        fields: forwarded_params
      }
    end

    def create
      return redirect_to(callback_url(error: "access_denied", error_description: "The user denied access"), allow_other_host: true) unless params[:decision] == "approve"
      grant = OauthGrant.create!(
        user: Current.user, oauth_client: @client, redirect_uri: @redirect_uri,
        code_challenge: params[:code_challenge], code_challenge_method: "S256",
        scopes: AiAccess.scopes_for(params[:access]).join(" "),
        resource: params[:resource].presence&.chomp("/") || Mcp::Endpoints.resource(origin)
      )
      redirect_to callback_url(code: grant.plaintext_code), allow_other_host: true
    end

    private
      def origin = Mcp::Endpoints.origin(request)

      def load_client
        @client = OauthClient.find_by_client_id(params[:client_id])
        return render_error(:unknown_client) unless @client
        @redirect_uri = params[:redirect_uri].presence || @client.default_redirect_uri
        render_error(:bad_redirect) unless @client.redirect_uri_allowed?(@redirect_uri)
      end

      def validate_request
        error =
          if params[:response_type] != "code" then [ "unsupported_response_type", "response_type must be code" ]
          elsif !params[:code_challenge].to_s.match?(/\A[A-Za-z0-9\-_]{43,128}\z/) then [ "invalid_request", "code_challenge (PKCE) is required" ]
          elsif params[:code_challenge_method] != "S256" then [ "invalid_request", "code_challenge_method must be S256" ]
          elsif params[:resource].present? && !Mcp::Endpoints.same_resource?(params[:resource], origin) then [ "invalid_target", "Unknown resource" ]
          elsif params[:state].to_s.length > 2000 then [ "invalid_request", "state is too long" ]
          end
        redirect_to callback_url(error: error[0], error_description: error[1]), allow_other_host: true if error
      end

      def forwarded_params
        params.permit(:response_type, :client_id, :redirect_uri, :state, :code_challenge, :code_challenge_method, :scope, :resource)
          .to_h.merge("redirect_uri" => @redirect_uri)
      end

      # The client's redirect URI with the OAuth response (and RFC 9207 iss).
      def callback_url(**values)
        uri = URI.parse(@redirect_uri)
        query = URI.decode_www_form(uri.query.to_s)
        values.merge(state: params[:state].presence, iss: origin).compact.each { |k, v| query << [ k.to_s, v.to_s ] }
        uri.query = URI.encode_www_form(query)
        uri.to_s
      end

      def host_label(value)
        uri = URI.parse(value.to_s)
        uri.host.presence || "#{uri.scheme}:"
      rescue URI::InvalidURIError
        value.to_s.first(60)
      end

      def render_error(reason)
        render inertia: "oauth/error", props: { reason: reason.to_s }, status: :bad_request
      end
  end
end
