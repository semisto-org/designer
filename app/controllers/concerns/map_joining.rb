# Shared by the two ways of joining a map from a link: an e-mail invitation
# (/invitations/:token) and the map's share link (/join/:token).
module MapJoining
  extend ActiveSupport::Concern

  private
    # A signed-out visitor first sees the place they are invited to (its
    # outline, who invites them, what they will be able to do, since when the
    # garden is being designed), then signs in (Google or magic link) and
    # comes back here to join.
    def require_sign_in_to_join(map, inviter:, role:, chat:)
      return true if authenticated?
      session[:return_to_after_authenticating] = request.url
      render inertia: "invitations/welcome", props: {
        invitation: Collab::InvitationWelcome.new(map, inviter:, role:, chat:).as_json,
        signInPath: new_session_path
      }
      false
    end

    # The map greets the newcomer once (`welcome` in its props, MapsController#show),
    # with who invited them: no toast on top of it.
    def joined(map, inviter:)
      flash[:joined_map] = { "id" => map.id, "inviter" => inviter&.display_name }
      redirect_to map_path(map)
    end

    def render_join_problem(state, map: nil, status:)
      render inertia: "invitations/show", props: { state:, mapName: map&.name }, status:
    end
end
