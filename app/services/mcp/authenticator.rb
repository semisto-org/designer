module Mcp
  # Resolves `Authorization: Bearer …` to a Principal: a personal access
  # token (sdp_…) or an OAuth access token (sda_…) issued for this resource.
  module Authenticator
    def self.bearer(authorization)
      authorization.to_s[/\ABearer\s+([A-Za-z0-9_\-.~+\/]+=*)\s*\z/i, 1]
    end

    def self.call(authorization, resource:)
      token = bearer(authorization)
      return nil unless token

      if (api_token = ApiToken.authenticate(token))
        api_token.record_use!
        Principal.new(user: api_token.user, scopes: api_token.scope_list, client_name: api_token.name, credential: api_token)
      elsif (access = OauthAccessToken.authenticate(token))
        return nil if access.resource.present? && access.resource.chomp("/") != resource
        access.record_use!
        Principal.new(user: access.user, scopes: access.scope_list, client_name: access.oauth_client.name, credential: access)
      end
    end
  end
end
