# The link in the invitation e-mail. Signed-out visitors sign in first, then
# are brought back here and join the map.
class InvitationsController < ApplicationController
  include MapJoining
  allow_unauthenticated_access only: :show

  def show
    invitation = MapInvitation.includes(:map).find_by(token: params[:token])
    return render_join_problem("invalid", status: :not_found) unless invitation && invitation.map.archived_at.nil?
    map = invitation.map
    return unless require_sign_in_to_join(map)

    if invitation.accepted?
      return joined(map) if map.viewable_by?(Current.user)
      return render_join_problem("used", map:, status: :gone)
    end
    return render_join_problem("expired", map:, status: :gone) if invitation.expired?

    invitation.accept!(Current.user)
    joined(map)
  rescue Map::EditorLimitReached
    render_join_problem("editor_limit", map:, status: :conflict)
  end
end
