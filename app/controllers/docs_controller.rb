# Public documentation of the MCP server, generated from the tool
# definitions (Mcp::Docs).
class DocsController < ApplicationController
  allow_unauthenticated_access

  def mcp
    origin = Mcp::Endpoints.origin(request)
    render inertia: "pages/docs/mcp", props: {
      tools: Mcp::Docs.tools,
      endpoints: Mcp::Endpoints.all(origin),
      scopes: AiAccess::SCOPES,
      limits: {
        requestsPerMinute: 120,
        maxFeaturesPerProposal: Mcp::DraftProposal::MAX_FEATURES,
        maxPendingDrafts: Mcp::DraftProposal::MAX_PENDING,
        bufferM: Mcp::DraftProposal::BUFFER_M,
        accessTokenMinutes: OauthAccessToken::ACCESS_TTL.in_minutes.to_i,
        refreshTokenDays: OauthAccessToken::REFRESH_TTL.in_days.to_i
      }
    }
  end
end
