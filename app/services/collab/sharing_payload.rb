module Collab
  # What the "Partager" dialog shows: members with their roles, pending
  # invitations, the share link. Only the owner sees e-mail addresses,
  # invitations and the link; everyone with access sees who is on the map.
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
        maxEditors: Map::MAX_EDITORS,
        editorsCount: @map.editors_count,
        members: members(owner),
        organization: organization
      }
      data[:invitations] = invitations if owner
      data[:link] = link if owner
      data
    end

    private
      def members(owner)
        @map.memberships.includes(:user).sort_by { |m| [ m.role == "owner" ? 0 : 1, m.created_at ] }.map do |m|
          {
            id: m.id, userId: m.user_id, name: m.user.display_name, avatarUrl: m.user.avatar_url,
            email: (m.user.email_address if owner), role: m.role, you: m.user_id == @user.id
          }
        end
      end

      def organization
        return nil unless @map.organization
        { name: @map.organization.name, members: @map.organization.memberships.count }
      end

      def invitations
        @map.invitations.pending.order(:created_at).map do |i|
          { id: i.id, email: i.email_address, role: i.role, expiresAt: i.expires_at&.iso8601, sentAt: i.last_sent_at&.iso8601 }
        end
      end

      def link
        link = @map.share_link
        return { enabled: false, role: "viewer", url: nil } unless link
        { enabled: link.enabled?, role: link.role, url: (@urls.join_url(link.token) if link.enabled?) }
      end
  end
end
