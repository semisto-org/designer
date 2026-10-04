# /teams: the teams I belong to, creating one, and a team's page (members,
# invitations, maps). Admins rename and delete the team. The rules live in
# Organization and OrganizationMembership.
class TeamsController < ApplicationController
  include TeamScoped

  rate_limit to: 10, within: 1.hour, only: :create,
             with: -> { redirect_to teams_path, alert: t("teams.errors.rate_limited"), status: :see_other }

  before_action :set_team, only: %i[show update destroy]
  before_action :require_team_admin!, only: %i[update destroy]

  def index
    memberships = Current.user.organization_memberships.includes(:organization).to_a
    ids = memberships.map(&:organization_id)
    members = OrganizationMembership.where(organization_id: ids).group(:organization_id).count
    maps = Map.active.where(organization_id: ids).group(:organization_id).count
    teams = memberships.sort_by { |m| [ m.organization.name.downcase, m.organization_id ] }.map do |m|
      { id: m.organization_id, name: m.organization.name, role: m.role,
        membersCount: members.fetch(m.organization_id, 0), mapsCount: maps.fetch(m.organization_id, 0) }
    end
    render inertia: "teams/index", props: { teams: }
  end

  def create
    team = Organization.create_with_admin!(Current.user, name: team_params[:name])
    redirect_to team_path(team), notice: t("teams.created", name: team.name), status: :see_other
  rescue ActiveRecord::RecordInvalid => e
    redirect_to teams_path, inertia: { errors: e.record.errors }, status: :see_other
  end

  def show
    render inertia: "teams/show", props: Teams::TeamPayload.new(@team, Current.user).as_json
  end

  def update
    if @team.update(name: team_params[:name])
      redirect_to team_path(@team), notice: t("teams.renamed"), status: :see_other
    else
      redirect_to team_path(@team), inertia: { errors: @team.errors }, status: :see_other
    end
  end

  # The team's maps go back to their owners only (nothing is deleted).
  def destroy
    users = @team.users.to_a
    maps = @team.maps.to_a
    name = @team.name
    @team.destroy!
    Organization.purge_lost_access(users:, maps:)
    redirect_to teams_path, notice: t("teams.deleted", name:), status: :see_other
  end

  private
    def team_params
      params.fetch(:team, {}).permit(:name)
    end
end
