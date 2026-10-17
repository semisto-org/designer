# The map's harvest log (« Récoltes » panel): every fruit plant season by
# season, and the same line noted for several plants at once (the trees of
# a row picked the same day).
module Maps
  class HarvestsController < ApplicationController
    include MapScoped

    MAX_PLANTS = 500

    before_action :set_map
    before_action :require_editor!, except: :index

    def index
      season = params[:season].to_s.match?(/\A\d{4}\z/) ? params[:season].to_i : Date.current.year
      render json: HarvestLog.new(@map, season:)
    end

    # POST { feature_ids: [...], plant_harvest: { noted_on, stage, amount, uses, note } }
    # All or nothing: one invalid line saves none.
    def create
      ids = Array(params[:feature_ids]).map(&:to_i).uniq.first(MAX_PLANTS)
      plants = @map.features.active.where(kind: PlantableFeature::PLANT, id: ids).to_a
      return render json: { message: t("plant_harvests.errors.no_plant") }, status: :unprocessable_entity if plants.empty?

      harvests = plants.map { _1.plant_harvests.new(harvest_params.merge(user: Current.user)) }
      invalid = harvests.find(&:invalid?)
      return render_errors invalid if invalid

      PlantHarvest.transaction { harvests.each(&:save!) }
      render json: { created: harvests.size, log: HarvestLog.new(@map, season: harvests.first.season) }, status: :created
    end

    private
      def harvest_params
        params.require(:plant_harvest).permit(:noted_on, :stage, :amount, :quantity_kg, :note, uses: [])
      end
  end
end
