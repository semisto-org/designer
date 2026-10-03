# OAuth 2.0 token revocation (RFC 7009): a client gives back an access or
# refresh token. The answer is 200 whether or not the token was known.
module Oauth
  class RevocationsController < ActionController::API
    include AgentApi
    include OauthClientAuthentication

    def create
      client = authenticate_client
      return oauth_error("invalid_client", status: :unauthorized) unless client
      value = params[:token].to_s
      token = OauthAccessToken.find_by_refresh_token(value) ||
        OauthAccessToken.find_by(token_digest: SecretDigest.digest(value))
      token.revoke! if token && token.oauth_client_id == client.id
      no_store!
      head :ok
    end
  end
end
