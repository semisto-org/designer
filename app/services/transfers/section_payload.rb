module Transfers
  # The « Transférer la propriété » section of the sharing dialog. The owner
  # gets the pending proposal, or the people the map can be proposed to: its
  # editors, and the members of its team (they edit without a seat; the
  # former owner then needs a free one). Anyone else only learns about a
  # proposal made to them (`incoming`, for the editor's header notice).
  class SectionPayload
    def initialize(map, user, url_helpers:)
      @map = map
      @user = user
      @urls = url_helpers
    end

    def as_json(*)
      return { role: @map.role_for(@user), incoming: } unless @map.manageable_by?(@user)

      {
        role: "owner",
        pending:,
        candidates:,
        seatsLeft: [ Map::MAX_EDITORS - @map.editor_seats_taken, 0 ].max,
        viewersCount: @map.memberships.where(role: "viewer").count,
        team: @map.organization&.name,
        expiresInDays: MapTransfer::EXPIRES_IN.in_days.to_i,
        archived: @map.archived_at?
      }
    end

    private
      def pending
        transfer = @map.transfers.pending.includes(:to_user).first
        return nil unless transfer

        problem = transfer.problem
        {
          id: transfer.id,
          recipient: person(transfer.to_user, via_team: transfer.seat_needed?),
          createdAt: transfer.created_at.iso8601,
          expiresAt: transfer.expires_at.iso8601,
          problem: problem && transfer.message_for(problem, audience: :owner)
        }
      end

      def candidates
        editors = @map.memberships.where(role: "editor").includes(:user).order(:created_at).map(&:user)
        team = []
        if @map.organization
          team = @map.organization.users.where.not(id: [ @map.owner_id, *editors.map(&:id) ]).to_a
            .sort_by { |u| [ u.display_name.downcase, u.id ] }
        end
        editors.map { |u| person(u, via_team: false) } + team.map { |u| person(u, via_team: true) }
      end

      # The owner sees their editors' e-mails in the sharing dialog already;
      # a team's addresses stay with its admins (Teams::TeamPayload).
      def person(user, via_team:)
        { userId: user.id, name: user.display_name, email: (user.email_address unless via_team), avatarUrl: user.avatar_url, viaTeam: via_team }
      end

      def incoming
        transfer = @map.transfers.pending.includes(:from_user).find_by(to_user: @user)
        transfer && {
          id: transfer.id,
          fromName: transfer.from_user.display_name,
          expiresAt: transfer.expires_at.iso8601,
          path: @urls.map_transfer_path(@map, transfer)
        }
      end
  end
end
