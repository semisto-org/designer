# Client authentication at the token and revocation endpoints: public
# clients send their client_id; confidential ones add their secret, in the
# body (client_secret_post) or with HTTP Basic (client_secret_basic).
module OauthClientAuthentication
  extend ActiveSupport::Concern

  private
    def authenticate_client
      id, secret = basic_credentials || [ params[:client_id], params[:client_secret] ]
      client = OauthClient.find_by_client_id(id)
      return nil unless client
      return client unless client.confidential?
      client.authenticate_secret(secret) ? client : nil
    end

    def basic_credentials
      return nil unless request.authorization.to_s.start_with?("Basic ")
      id, secret = ActionController::HttpAuthentication::Basic.user_name_and_password(request)
      [ CGI.unescape(id.to_s), CGI.unescape(secret.to_s) ]
    end

    def oauth_error(error, description = nil, status: :bad_request)
      no_store!
      response.headers["WWW-Authenticate"] = %(Basic realm="oauth") if status == :unauthorized && basic_credentials
      render(json: { error:, error_description: description }.compact, status:)
    end
end
