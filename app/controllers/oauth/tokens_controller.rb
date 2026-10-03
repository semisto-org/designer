# OAuth 2.1 token endpoint: authorization code (with PKCE) and refresh
# token grants. Refresh tokens rotate; a reused one revokes the client's
# tokens for that user.
module Oauth
  class TokensController < ActionController::API
    include AgentApi
    include OauthClientAuthentication

    rate_limit to: 60, within: 1.minute, with: -> { oauth_error("slow_down", status: :too_many_requests) },
      store: AgentApi::RATE_LIMIT_STORE, only: :create

    def create
      @client = authenticate_client
      return oauth_error("invalid_client", "Unknown client or bad credentials", status: :unauthorized) unless @client
      grant_type = params[:grant_type].to_s
      unless OauthClient::GRANT_TYPES.include?(grant_type)
        return oauth_error("unsupported_grant_type", "Supported: #{OauthClient::GRANT_TYPES.join(', ')}")
      end
      return oauth_error("unauthorized_client", "Grant type not registered") unless @client.grant_types.include?(grant_type)
      grant_type == "authorization_code" ? exchange_code : refresh
    end

    private
      def exchange_code
        grant = OauthGrant.find_by_code(params[:code])
        return oauth_error("invalid_grant", "Unknown authorization code") unless grant && grant.oauth_client_id == @client.id
        if grant.used?
          # A replayed code may have been stolen: revoke what it gave.
          grant.access_tokens.unrevoked.update_all(revoked_at: Time.current)
          return oauth_error("invalid_grant", "Authorization code already used")
        end
        return oauth_error("invalid_grant", "Authorization code expired") if grant.expired?
        if params[:redirect_uri].present? && params[:redirect_uri] != grant.redirect_uri
          return oauth_error("invalid_grant", "redirect_uri does not match")
        end
        return oauth_error("invalid_grant", "PKCE verification failed") unless grant.verify_pkce(params[:code_verifier])
        return oauth_error("invalid_target", "Unknown resource") unless resource_ok?(grant.resource)
        return oauth_error("invalid_grant", "Authorization code already used") unless grant.redeem!

        token = OauthAccessToken.issue!(
          user: grant.user, client: @client, scopes: grant.scopes,
          resource: grant.resource || Mcp::Endpoints.resource(origin), grant:
        )
        issue(token)
      end

      def refresh
        previous = OauthAccessToken.find_by_refresh_token(params[:refresh_token])
        return oauth_error("invalid_grant", "Unknown refresh token") unless previous && previous.oauth_client_id == @client.id
        return oauth_error("invalid_target", "Unknown resource") unless resource_ok?(previous.resource)

        requested = params[:scope].presence
        if requested && (AiAccess.unknown(requested).any? || (AiAccess.normalize(requested) - previous.scope_list).any?)
          return oauth_error("invalid_scope", "Cannot widen the granted scope")
        end

        token = nil
        reused = false
        previous.with_lock do
          if previous.revoked?
            reused = true
          elsif !previous.refresh_expired?
            previous.update!(revoked_at: Time.current)
            token = OauthAccessToken.issue!(
              user: previous.user, client: @client, scopes: requested || previous.scopes,
              resource: previous.resource, grant: previous.oauth_grant
            )
          end
        end
        if reused
          OauthAccessToken.revoke_all!(user: previous.user, client: @client)
          return oauth_error("invalid_grant", "Refresh token already used")
        end
        return oauth_error("invalid_grant", "Refresh token expired") unless token
        issue(token)
      end

      def resource_ok?(granted)
        requested = params[:resource].presence
        return true unless requested
        Mcp::Endpoints.same_resource?(requested, origin) && (granted.nil? || granted.chomp("/") == requested.chomp("/"))
      end

      def issue(token)
        no_store!
        render json: token.token_response
      end
  end
end
