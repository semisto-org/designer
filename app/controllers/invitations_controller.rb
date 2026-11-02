# The link in the invitation e-mail. Signed-out visitors see the place they are
# invited to and sign in, then are brought back here and join the map.
class InvitationsController < ApplicationController
  include MapJoining
  allow_unauthenticated_access only: :show

  def show
    invitation = MapInvitation.includes(:map, :invited_by).find_by(token: params[:token])
    return render_join_problem("invalid", status: :not_found) unless invitation && invitation.map.archived_at.nil?
    map = invitation.map
    return unless require_sign_in_to_join(map, inviter: invitation.invited_by, role: invitation.role, chat: invitation.role == "editor" || invitation.chat_access)

    if invitation.accepted?
      return joined(map, inviter: invitation.invited_by) if map.viewable_by?(Current.user)
      return render_join_problem("used", map:, status: :gone)
    end
    return render_join_problem("expired", map:, status: :gone) if invitation.expired?

    invitation.accept!(Current.user)
    joined(map, inviter: invitation.invited_by)
  end
end
