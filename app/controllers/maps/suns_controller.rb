# JSON for the "Soleil" panel of the map editor: the horizon of the terrain,
# the sun's paths through the seasons and the hours of direct sun month by
# month (Sun::MapReport). Open to every role and every plan.
module Maps
  class SunsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Sun::MapReport.new(@map).as_json
    end
  end
end
