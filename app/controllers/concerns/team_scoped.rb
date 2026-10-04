# Loads @team from params[:team_id] (or params[:id]) for its members only
# (404 for everyone else, so a team's existence does not leak) and checks the
# admin role.
module TeamScoped
  extend ActiveSupport::Concern

  private
    def set_team
      @team = Organization.find_by(id: params[:team_id] || params[:id])
      @team_membership = @team&.membership_for(Current.user)
      head :not_found unless @team_membership
    end

    def team_admin? = @team_membership&.admin?

    def require_team_admin!
      return if team_admin?
      redirect_to team_path(@team), alert: t("teams.errors.admin_only"), status: :see_other
    end
end
