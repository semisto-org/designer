# « Connecter Claude »: how to plug one's own Claude (or another MCP
# agent) on one's maps, the apps authorized through OAuth and the personal
# access tokens.
module Account
  class AiController < ApplicationController
    def show
      render inertia: "account/ai", props: {
        endpoints: Mcp::Endpoints.all(Mcp::Endpoints.origin(request)).slice(:mcp, :docs),
        tokens: ApiToken.active.where(user: Current.user).newest_first.map(&:as_inertia),
        apps: authorized_apps,
        planAllowsDrafts: Current.user.entitlements.ai_drafts?,
        expiryChoices: ApiToken::EXPIRY_CHOICES.keys
      }
    end

    private
      def authorized_apps
        tokens = OauthAccessToken.live.where(user: Current.user).includes(:oauth_client).order(:created_at)
        tokens.group_by(&:oauth_client).map do |client, rows|
          authorized_at = OauthGrant.where(user: Current.user, oauth_client: client).where.not(used_at: nil).minimum(:created_at)
          {
            id: client.id, name: client.name, access: AiAccess.level(rows.last.scopes),
            authorizedAt: (authorized_at || rows.first.created_at).iso8601,
            lastUsedAt: rows.filter_map(&:last_used_at).max&.iso8601
          }
        end
      end
  end
end
