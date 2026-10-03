# The map's share link ("anyone with the link"): /join/:token.
class JoinsController < ApplicationController
  include MapJoining
  allow_unauthenticated_access only: :show

  def show
    link = MapShareLink.includes(:map).find_by(token: params[:token])
    return render_join_problem("invalid", status: :not_found) unless link && link.map.archived_at.nil?
    map = link.map
    return render_join_problem("disabled", map:, status: :gone) unless link.enabled?
    return unless require_sign_in_to_join(map)

    link.accept!(Current.user)
    joined(map)
  rescue Map::EditorLimitReached
    render_join_problem("editor_limit", map:, status: :conflict)
  end
end
