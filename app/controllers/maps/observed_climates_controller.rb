# JSON for the « Le climat observé ici » section of the "Climat" panel:
# thirty years of ERA5-Land at the map's grid cell. The first request
# starts the computation (minutes); the panel polls until it is ready.
module Maps
  class ObservedClimatesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: ObservedClimate::MapReport.new(@map).as_json
    end
  end
end
