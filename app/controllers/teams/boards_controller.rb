# The team board (« Tableau de l'équipe », /teams/:id/board): the team's
# requests and projects for its operational meeting (Teams::Board). Every
# member of the team sees it and works on it.
module Teams
  class BoardsController < ApplicationController
    include TeamScoped

    before_action :set_team

    def show
      @team_membership.touch(:board_opened_at) if request.format.html? && !impersonating?
      render inertia: "teams/board", props: Teams::Board.new(@team, Current.user).as_json.merge(myTeams: my_teams)
    end

    private
      # The switcher at the top of the board: every team I belong to.
      def my_teams
        Current.user.organizations.order(Arel.sql("LOWER(organizations.name)"), :id)
          .pluck(:id, :name).map { |id, name| { id:, name: } }
      end
  end
end
