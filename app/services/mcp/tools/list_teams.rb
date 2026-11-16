module Mcp
  module Tools
    # The teams of the connected person (« Équipes »), with their members as
    # on the team's page: role, maps they brought to the team and, for the
    # team's admins only (as on the page), when each member last used
    # Terranova. E-mail addresses never leave through the MCP.
    class ListTeams < Base
      arguments(properties: {})
      hints

      def perform
        at = Time.current
        memberships = user.organization_memberships.includes(:organization).to_a
        ids = memberships.map(&:organization_id)
        everyone = OrganizationMembership.where(organization_id: ids).includes(:user).group_by(&:organization_id)
        owned = Map.active.where(organization_id: ids).group(:organization_id, :owner_id).count
        teams = memberships.sort_by { |m| [ m.organization.name.downcase, m.organization_id ] }.map do |mine|
          team = mine.organization
          admin = mine.admin?
          members = everyone.fetch(team.id, []).sort_by { |m| [ m.admin? ? 0 : 1, m.user.display_name.downcase, m.id ] }.map do |m|
            member = { name: m.user.display_name, role: m.role, you: m.user_id == user.id, maps_count: owned.fetch([ team.id, m.user_id ], 0) }
            admin ? member.merge(last_active_at: m.user.last_active_at&.iso8601, days_since_active: m.user.last_active_at && ((at - m.user.last_active_at) / 1.day).floor) : member
          end
          { id: team.id, name: team.name, role: mine.role, can_see_activity: admin, members:, url: "#{origin}/teams/#{team.id}" }
        end
        { teams: }
      end

      private
        def summarize_result(data) = { teams: data[:teams].size }
    end
  end
end
