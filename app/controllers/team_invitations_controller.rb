# The link in a team invitation e-mail. Signed-out visitors sign in first
# (Google or magic link), are brought back here and join the team.
class TeamInvitationsController < ApplicationController
  allow_unauthenticated_access only: :show

  def show
    invitation = OrganizationInvitation.includes(:organization).find_by(token: params[:token].to_s)
    return render_problem("invalid", status: :not_found) unless invitation
    team = invitation.organization
    return unless require_sign_in(team)

    if invitation.accepted?
      return joined(team) if team.member?(Current.user)
      return render_problem("used", team:, status: :gone)
    end
    return render_problem("expired", team:, status: :gone) if invitation.expired?

    invitation.accept!(Current.user)
    joined(team)
  end

  private
    def require_sign_in(team)
      return true if authenticated?
      session[:return_to_after_authenticating] = request.url
      redirect_to new_session_path, notice: t("teams.joining.sign_in_first", team: team.name)
      false
    end

    def joined(team)
      redirect_to team_path(team), notice: t("teams.joining.joined", team: team.name)
    end

    def render_problem(state, status:, team: nil)
      render inertia: "team_invitations/show", props: { state:, teamName: team&.name }, status:
    end
end
