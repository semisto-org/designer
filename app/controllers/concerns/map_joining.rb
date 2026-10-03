# Shared by the two ways of joining a map from a link: an e-mail invitation
# (/invitations/:token) and the map's share link (/join/:token).
module MapJoining
  extend ActiveSupport::Concern

  private
    # Sends visitors to sign in first (Google or magic link), then back here.
    def require_sign_in_to_join(map)
      return true if authenticated?
      session[:return_to_after_authenticating] = request.url
      redirect_to new_session_path, notice: t("collab.joining.sign_in_first", map: map.name)
      false
    end

    def joined(map)
      redirect_to map_path(map), notice: t("collab.joining.joined", map: map.name)
    end

    def render_join_problem(state, map: nil, status:)
      render inertia: "invitations/show", props: { state:, mapName: map&.name }, status:
    end
end
