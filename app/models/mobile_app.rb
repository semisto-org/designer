# Semisto Designer's own iOS and Android app (mobile/). It signs in through
# the OAuth server built for MCP clients, as a public client (PKCE) with a
# fixed client_id and a private-use redirect scheme, and is the only client
# that receives the APP scope: its access token then works on the app's
# JSON endpoints as if the user were signed in (Authentication).
module MobileApp
  CLIENT_ID = "semisto-designer-mobile"
  NAME = "Semisto Designer"
  REDIRECT_URI = "org.semisto.designer://oauth"
  SCOPES = [ AiAccess::READ, AiAccess::DRAFTS, AiAccess::APP ].freeze

  # Created on first use: nothing to seed in each environment.
  def self.client
    OauthClient.find_by(client_id: CLIENT_ID) || OauthClient.create!(
      client_id: CLIENT_ID, name: NAME, redirect_uris: [ REDIRECT_URI ],
      token_endpoint_auth_method: "none", grant_types: OauthClient::GRANT_TYPES
    )
  rescue ActiveRecord::RecordNotUnique
    OauthClient.find_by!(client_id: CLIENT_ID)
  end

  def self.client?(client) = client&.client_id == CLIENT_ID

  # The access token of a request, if it is a live token of the app with
  # the APP scope. Any other token (Claude, personal tokens) gets nil.
  def self.token_for(authorization)
    plaintext = Mcp::Authenticator.bearer(authorization)
    return nil unless plaintext
    token = OauthAccessToken.authenticate(plaintext)
    return nil unless token && client?(token.oauth_client) && token.scope_list.include?(AiAccess::APP)
    token
  end
end
