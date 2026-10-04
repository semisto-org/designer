# Follow-up of a planted plant: observations (take, vigour, note, photo).
module Maps
  class PlantObservationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_plant

    def index
      render json: { observations: observations.map(&:as_json) }
    end

    def create
      observation = @plant.plant_observations.new(observation_params.merge(user: Current.user))
      if observation.save
        render json: { observation:, observations: observations.map(&:as_json) }, status: :created
      else
        render_errors observation
      end
    end

    def destroy
      @plant.plant_observations.find(params[:id]).destroy!
      render json: { observations: observations.map(&:as_json) }
    end

    private
      def set_plant
        @plant = @map.features.find_by!(id: params[:feature_id], kind: PlantableFeature::PLANT)
      end

      def observations
        @plant.plant_observations.includes(:user, photo_attachment: :blob).reorder(observed_on: :desc, id: :desc)
      end

      def observation_params
        params.require(:plant_observation).permit(:observed_on, :survival, :vigor, :note, :photo)
      end
  end
end
