module Collab
  # What the "Partager" dialog shows: members with their roles, pending
  # invitations, the share link. Only the owner sees e-mail addresses,
  # invitations and the link; everyone with access sees who is on the map
  # and who owns the place, and the place's owners see their own choices.
  class SharingPayload
    def initialize(map, user, url_helpers:)
      @map = map
      @user = user
      @urls = url_helpers
    end

    def as_json(*)
      owner = @map.manageable_by?(@user)
      data = {
        role: @map.role_for(@user),
        editorsCount: @map.editors_count,
        members: members(owner),
        organization: organization,
        place: place
      }
      data[:invitations] = invitations if owner
      data[:link] = link if owner
      data[:teams] = teams if owner
      data
    end

    private
      def members(owner)
        @map.memberships.includes(:user).sort_by { |m| [ m.role == "owner" ? 0 : 1, m.created_at ] }.map do |m|
          {
            id: m.id, userId: m.user_id, name: m.user.display_name, avatarUrl: m.user.avatar_url,
            email: (m.user.email_address if owner), role: m.role, you: m.user_id == @user.id, placeOwner: m.place_owner
          }
        end
      end

      # The place's owners and their choices (MapPlaceOwners).
      def place
        owners = @map.memberships.where(place_owner: true).includes(:user).order(:created_at)
        {
          owners: owners.map { |m| m.user.display_name },
          you: owners.any? { |m| m.user_id == @user.id },
          sharesPlantedPalette: @map.shares_planted_palette,
          acceptsPropagationRequests: @map.accepts_propagation_requests,
          pendingRequests: @map.place_owner?(@user) ? @map.propagation_requests.pending.count : nil
        }
      end

      def organization
        return nil unless @map.organization
        { id: @map.organization.id, name: @map.organization.name, members: @map.organization.memberships.count }
      end

      # The owner's teams, where the map can be moved (Maps::TeamsController).
      def teams
        @user.organizations.order(:name, :id).map { |team| { id: team.id, name: team.name } }
      end

      def invitations
        @map.invitations.pending.order(:created_at).map do |i|
          { id: i.id, email: i.email_address, role: i.role, expiresAt: i.expires_at&.iso8601, sentAt: i.last_sent_at&.iso8601, placeOwner: i.place_owner }
        end
      end

      def link
        link = @map.share_link
        return { enabled: false, role: "viewer", url: nil } unless link
        { enabled: link.enabled?, role: link.role, url: (@urls.join_url(link.token) if link.enabled?) }
      end
  end
end
