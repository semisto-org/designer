# What a water link connects and the drop along it (WaterLinks::Report), or,
# for a tank or a pond, the links that leave it or reach it. Read by the
# inspector's « Raccordements » section.
module Maps
  class WaterLinksController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      feature = @map.features.where.not(status: "rejected").find(params[:id])
      render json: WaterLinks::Report.new(@map, feature).as_json
    end
  end
end
