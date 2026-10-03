module Maps
  # Invite by e-mail (owner only). The mail holds a link to /invitations/:token.
  class InvitationsController < ApplicationController
    include MapScoped

    rate_limit to: 30, within: 1.hour, only: %i[create resend],
               with: -> { render json: { message: t("collab.sharing.errors.rate_limited") }, status: :too_many_requests }

    before_action :set_map
    before_action :require_owner!
    before_action :set_invitation, only: %i[destroy resend]

    def create
      attrs = params.require(:invitation).permit(:email_address, :role)
      invitation = @map.invitations.pending.find_by(email_address: attrs[:email_address].to_s.strip.downcase)
      if invitation
        # Same address invited again: update the role and send it again.
        invitation.assign_attributes(role: attrs[:role].presence || invitation.role)
        return render_invalid(invitation) unless invitation.save
      else
        invitation = @map.invitations.new(attrs.merge(invited_by: Current.user))
        return render_invalid(invitation) unless invitation.save
      end
      invitation.deliver!
      render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self), status: :created
    end

    def resend
      @invitation.deliver!
      render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
    end

    def destroy
      @invitation.destroy!
      render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
    end

    private
      def set_invitation
        @invitation = @map.invitations.pending.find(params[:id])
      end

      def render_invalid(invitation)
        errors = invitation.errors
        message =
          if errors.of_kind?(:role, :editor_limit) then t("collab.sharing.errors.editor_limit_invite", count: Map::MAX_EDITORS)
          elsif errors.of_kind?(:email_address, :already_participant) then t("collab.sharing.errors.already_participant")
          elsif errors.include?(:email_address) then t("collab.sharing.errors.invalid_email")
          else invitation.errors.full_messages.to_sentence
          end
        render json: { message:, errors: errors.to_hash(true) }, status: :unprocessable_entity
      end
  end
end
