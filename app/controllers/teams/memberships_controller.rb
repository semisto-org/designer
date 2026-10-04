module Teams
  # Admins change a member's role or remove them; anyone leaves on their own.
  # The team always keeps an admin (OrganizationMembership).
  class MembershipsController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :set_membership
    before_action :require_team_admin!, only: :update

    def update
      role = params.fetch(:membership, {})[:role].to_s
      return back_with_alert(t("teams.errors.role")) unless OrganizationMembership::ROLES.include?(role)
      return back_with_alert(t("teams.errors.last_admin_role")) unless @membership.update(role:)

      notice = t("teams.members.role_changed", name: @membership.user.display_name, role: t("teams.roles.#{role}").downcase)
      redirect_to team_path(@team), notice:, status: :see_other
    end

    def destroy
      leaving = @membership.user_id == Current.user.id
      return back_with_alert(t("teams.errors.admin_only")) unless leaving || team_admin?

      unless @membership.destroy
        return back_with_alert(t(leaving ? "teams.errors.last_admin_leave" : "teams.errors.last_admin_remove"))
      end

      if leaving
        redirect_to teams_path, notice: t("teams.members.left", name: @team.name), status: :see_other
      else
        redirect_to team_path(@team), notice: t("teams.members.removed", name: @membership.user.display_name), status: :see_other
      end
    end

    private
      def set_membership
        @membership = @team.memberships.includes(:user).find_by(id: params[:id])
        head :not_found unless @membership
      end

      def back_with_alert(message)
        redirect_to team_path(@team), alert: message, status: :see_other
      end
  end
end
