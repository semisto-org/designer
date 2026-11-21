# « Plan directeur »: the numbered design of a map (MasterPlan), for the
# PDF the browser lays out. Anyone on the map reads it; the team's own
# purpose only for its editors.
module Maps
  class MasterPlansController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: MasterPlan.new(@map, team: editor?).as_json
    end

    private
      def editor? = %w[owner editor].include?(@role)
  end
end
