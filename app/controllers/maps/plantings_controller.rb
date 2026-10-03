# The planting of a map in one read (PlantingState): palette, species in
# use, patch compositions, plant list and coherence alerts.
module Maps
  class PlantingsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: PlantingState.new(@map)
    end
  end
end
