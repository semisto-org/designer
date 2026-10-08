# JSON for the « Arbres en place » panel of the map editor: the height of
# the trees standing on and around the terrain (Canopy::MapReport).
module Maps
  class CanopiesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Canopy::MapReport.new(@map).as_json
    end
  end
end
