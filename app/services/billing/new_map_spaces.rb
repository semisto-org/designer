# Where a user can put a new map: among their own maps, or in one of their
# teams. Every member adds maps to a team (Michael, 2026-10-28); a team
# someone pays for counts them against that plan, so its room does not
# depend on the member's own plan. A team nobody pays for counts its maps
# against their owner's plan, like the user's own maps.
module Billing
  class NewMapSpaces
    Space = Data.define(:team, :scope) do
      def team_id = team&.id
      def can_create? = scope.can_create_map?
    end

    def initialize(user)
      @user = user
    end

    # Own maps first, then the teams by name.
    def all
      @all ||= [ Space.new(team: nil, scope: Billing::Scope.own(@user)) ] +
        @user.organizations.includes(:billing_user).order(:name, :id).map do |team|
          Space.new(team:, scope: Billing::Scope.for_new_map(@user, team:))
        end
    end

    def any_room? = all.any?(&:can_create?)

    # The space a new map goes to: `team_id` (blank = own maps) when the user
    # may use it, else nil.
    def find(team_id)
      all.find { |space| space.team_id.to_s == team_id.to_s }
    end

    def as_json(*)
      all.map do |space|
        { teamId: space.team_id, name: space.team&.name, canCreate: space.can_create?, teamPaid: space.team&.billing_user_id.present? }
      end
    end
  end
end
