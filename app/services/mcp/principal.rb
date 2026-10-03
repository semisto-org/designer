module Mcp
  # Who is calling the MCP server: the user a bearer token acts for, the
  # scopes it was granted and the client it was issued to.
  Principal = Data.define(:user, :scopes, :client_name, :credential) do
    def credential_type = credential.is_a?(ApiToken) ? "token" : "oauth"
    def drafts? = scopes.include?(AiAccess::DRAFTS)
  end
end
