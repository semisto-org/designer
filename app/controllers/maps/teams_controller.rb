module Maps
  # Moves a map into one of its owner's teams, or takes it out (owner only).
  # The map stays the owner's and keeps following the owner's plan; the
  # team's members edit it without taking an editor seat (Map#role_for).
  class TeamsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    def update
      team_id = params.fetch(:map, {})[:team_id].presence
      team = team_id && Current.user.organizations.find_by(id: team_id)
      if team_id && !team
        return render json: { message: t("teams.map.errors.not_member") }, status: :unprocessable_entity
      end

      previous = @map.organization
      # A sharing change, not an edit: no lock_version bump, no reordering.
      @map.update_column(:organization_id, team&.id)
      Organization.purge_lost_access(users: previous.users.to_a, maps: [ @map ]) if previous && previous != team
      render json: Collab::SharingPayload.new(@map.reload, Current.user, url_helpers: self)
    end
  end
end
