# The team board (« Tableau de l'équipe », /teams/:id/board): the team's
# requests and projects for its operational meeting (Teams::Board). Every
# member of the team sees it and works on it.
module Teams
  class BoardsController < ApplicationController
    include TeamScoped

    before_action :set_team

    def show
      render inertia: "teams/board", props: Teams::Board.new(@team, Current.user).as_json
    end
  end
end
