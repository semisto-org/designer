# « Plan directeur »: the numbered design of a map (MasterPlan), for the
# PDF the browser lays out. Anyone on the map reads it; the team's own
# purpose only for its editors.
module Maps
  class MasterPlansController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      variant = params[:variant_id].presence && @map.variants.find_by(id: params[:variant_id])
      render json: MasterPlan.new(@map, team: editor?, variant:).as_json
    end

    private
      def editor? = %w[owner editor].include?(@role)
  end
end
