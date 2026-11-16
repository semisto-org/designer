module Mcp
  # Who is calling the MCP server: the user a bearer token acts for, the
  # scopes it was granted and the client it was issued to.
  Principal = Data.define(:user, :scopes, :client_name, :credential) do
    # A team's colleague (TeamAgent) calls the tools herself, on behalf of the
    # member who asked her (Agents::Toolbox): `user` is that member.
    def agent? = credential.is_a?(TeamAgent)

    def credential_type
      return "agent" if agent?
      credential.is_a?(ApiToken) ? "token" : "oauth"
    end

    def drafts? = scopes.include?(AiAccess::DRAFTS)
  end
end
