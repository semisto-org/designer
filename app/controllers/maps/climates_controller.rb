# JSON for the "Climat" panel of the map editor: current climate and
# hardiness zone, projections and plant checks (paid analyses), and the
# weather forecast when a forecast provider is configured.
module Maps
  class ClimatesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Climate::MapReport.new(@map, entitlements: map_entitlements).as_json
    end

    def forecast
      render json: Climate::ForecastReport.new(@map).as_json
    end
  end
end
