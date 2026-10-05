# The water sources of a map (well, rain, forest catchment…), each drinkable
# or not. Everyone on the map reads them; editors manage them. Writes answer
# with the refreshed list and the taps whose potability or link changed, so
# the editor shows them at once.
module Maps
  class WaterSourcesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_source, only: %i[update destroy]

    def index
      render json: { sources: @map.water_sources }
    end

    def create
      source = @map.water_sources.new(source_params)
      if source.save
        render json: { source:, sources: @map.water_sources.reload }, status: :created
      else
        render_errors source
      end
    end

    def update
      tap_ids = @source.taps.ids
      if @source.update(source_params)
        render json: { source: @source, sources: @map.water_sources.reload, features: changed_taps(tap_ids) }
      else
        render_errors @source
      end
    end

    def destroy
      tap_ids = @source.taps.ids
      @source.destroy!
      render json: { sources: @map.water_sources.reload, features: changed_taps(tap_ids) }
    end

    private
      def set_source
        @source = @map.water_sources.find(params[:id])
      end

      def source_params
        params.require(:water_source).permit(:name, :potable, :notes)
      end

      def changed_taps(ids)
        @map.features.where(id: ids).where.not(status: "rejected").map(&:as_geojson)
      end
  end
end
