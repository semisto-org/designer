module Teams
  # What a team's page shows. Every member sees who is in the team and the
  # team's maps; only admins see e-mail addresses and pending invitations.
  class TeamPayload
    def initialize(team, user)
      @team = team
      @user = user
      @membership = team.membership_for(user)
    end

    def as_json(*)
      data = {
        team: { id: @team.id, name: @team.name, role: @membership.role, createdAt: @team.created_at.iso8601 },
        members: members,
        maps: maps,
        maxNameLength: Organization::NAME_MAX_LENGTH
      }
      data[:invitations] = invitations if admin?
      data
    end

    private
      def admin? = @membership.admin?

      def memberships
        @memberships ||= @team.memberships.includes(:user).to_a
      end

      def members
        admins = memberships.count(&:admin?)
        owned = team_maps.group_by(&:owner_id).transform_values(&:size)
        memberships
          .sort_by { |m| [ m.admin? ? 0 : 1, m.user.display_name.downcase, m.id ] }
          .map do |m|
            {
              id: m.id, userId: m.user_id, name: m.user.display_name, avatarUrl: m.user.avatar_url,
              email: (m.user.email_address if admin?), role: m.role, you: m.user_id == @user.id,
              mapsCount: owned.fetch(m.user_id, 0), lastAdmin: m.admin? && admins == 1
            }
          end
      end

      def team_maps
        @team_maps ||= @team.maps.active.includes(:owner, :region).order(updated_at: :desc).to_a
      end

      def maps
        team_maps.map do |map|
          {
            id: map.id, name: map.name, address: map.address, regionName: map.region.name,
            ownerName: map.owner.display_name, ownedByYou: map.owner_id == @user.id,
            ownerInTeam: memberships.any? { |m| m.user_id == map.owner_id },
            areaM2: map.area_m2, stage: map.stage, updatedAt: map.updated_at.iso8601
          }
        end
      end

      def invitations
        @team.invitations.pending.order(:created_at).map do |i|
          { id: i.id, email: i.email_address, role: i.role, expiresAt: i.expires_at&.iso8601, sentAt: i.last_sent_at&.iso8601 }
        end
      end
  end
end
