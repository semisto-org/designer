# Regulatory alerts of a map (indicative), for the "Alertes" panel.
module Maps
  class AlertsController < ApplicationController
    include MapScoped

    before_action :set_map

    def index
      render json: RegulatoryAlerts.new(@map).as_json
    end
  end
end
