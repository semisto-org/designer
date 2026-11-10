# Super admin « Équipes »: every team, and the add-on modules Semisto grants
# them. « Territoire » (Terranova at the scale of a commune) is granted here
# only; a team never turns it on itself. Taking it back keeps its
# territories readable, read-only.
module Admin
  class TeamsController < BaseController
    def index
      teams = Organization.order(:name).to_a
      members = OrganizationMembership.group(:organization_id).count
      maps = Map.where.not(organization_id: nil).group(:organization_id).count
      territories = Territory.group(:organization_id, Arel.sql("archived_at IS NULL")).count
      render inertia: "admin/teams/index", props: {
        teams: teams.map do |team|
          {
            id: team.id, name: team.name, createdAt: team.created_at.iso8601,
            membersCount: members[team.id] || 0, mapsCount: maps[team.id] || 0,
            territoryModule: team.territory_module_granted_at&.iso8601,
            territoriesActive: territories[[ team.id, true ]] || 0,
            territoriesArchived: territories[[ team.id, false ]] || 0
          }
        end
      }
    end

    # territory_module: "grant" | "revoke"
    def update
      team = Organization.find(params[:id])
      case params[:territory_module]
      when "grant"
        team.grant_territory_module!
        AdminEvent.record!("territory_module_granted", admin: Current.user, request:, team_id: team.id, label: team.name)
      when "revoke"
        team.revoke_territory_module!
        AdminEvent.record!("territory_module_revoked", admin: Current.user, request:, team_id: team.id, label: team.name)
      else
        return head :unprocessable_entity
      end
      redirect_to admin_teams_path, notice: t("admin.teams.flash.#{params[:territory_module] == 'grant' ? 'granted' : 'revoked'}", name: team.name), status: :see_other
    end
  end
end
