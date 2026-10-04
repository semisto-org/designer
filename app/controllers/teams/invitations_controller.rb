module Teams
  # Invite by e-mail (admins only). The mail holds a link to
  # /teams/invitations/:token (TeamInvitationsController).
  class InvitationsController < ApplicationController
    include TeamScoped

    rate_limit to: 30, within: 1.hour, only: %i[create resend],
               with: -> { redirect_to team_path(params[:team_id]), alert: t("teams.errors.rate_limited_invites"), status: :see_other }

    before_action :set_team
    before_action :require_team_admin!
    before_action :set_invitation, only: %i[destroy resend]

    def create
      email = params.dig(:invitation, :email_address).to_s.strip.downcase
      # The role is read on its own and checked against an allowlist: an unknown
      # value falls back to the model default (member), never to an arbitrary string.
      role = params.dig(:invitation, :role).to_s.presence_in(OrganizationInvitation::ROLES)

      # Same address invited again: update the role and send it again.
      invitation = @team.invitations.pending.find_by(email_address: email) ||
                   @team.invitations.new(email_address: email, invited_by: Current.user)
      invitation.role = role if role
      unless invitation.save
        return redirect_to team_path(@team), inertia: { errors: invitation_errors(invitation) }, status: :see_other
      end

      invitation.deliver!
      redirect_to team_path(@team), notice: t("teams.invitations.sent", email:), status: :see_other
    end

    def resend
      @invitation.deliver!
      redirect_to team_path(@team), notice: t("teams.invitations.resent", email: @invitation.email_address), status: :see_other
    end

    def destroy
      @invitation.destroy!
      redirect_to team_path(@team), notice: t("teams.invitations.cancelled", email: @invitation.email_address), status: :see_other
    end

    private
      def set_invitation
        @invitation = @team.invitations.pending.find_by(id: params[:id])
        head :not_found unless @invitation
      end

      def invitation_errors(invitation)
        errors = invitation.errors
        message =
          if errors.of_kind?(:email_address, :already_member) then t("teams.errors.already_member")
          elsif errors.include?(:email_address) then t("teams.errors.invalid_email")
          else errors.full_messages.to_sentence
          end
        { email_address: message }
      end
  end
end
