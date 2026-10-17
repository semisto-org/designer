# Harvest log of one plant: « porte des fruits » and « récolté » lines,
# season after season (see PlantHarvest, HarvestLog).
module Maps
  class PlantHarvestsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_plant

    def index
      render json: payload
    end

    def create
      harvest = @plant.plant_harvests.new(harvest_params.merge(user: Current.user))
      if harvest.save
        render json: payload.merge(harvest:), status: :created
      else
        render_errors harvest
      end
    end

    def destroy
      @plant.plant_harvests.find(params[:id]).destroy!
      render json: payload
    end

    private
      def set_plant
        @plant = @map.features.find_by!(id: params[:feature_id], kind: PlantableFeature::PLANT)
      end

      def payload
        log = HarvestLog.new(@map)
        {
          harvests: @plant.plant_harvests.includes(:user).newest_first.map(&:as_json),
          seasons: log.seasons, followedSeasons: log.followed_seasons, watchSeasons: HarvestLog::WATCH_SEASONS,
          plant: log.plant(@plant.id)&.then { _1.merge(seasons: _1[:seasons].transform_keys(&:to_s)) }
        }
      end

      def harvest_params
        params.require(:plant_harvest).permit(:noted_on, :stage, :amount, :quantity_kg, :note, uses: [])
      end
  end
end
