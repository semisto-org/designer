# Temperature and humidity readings of a fruit store (a feature of kind
# "fruit_store"), and what they mean for keeping fruit (StorageClimate).
module Maps
  class StorageReadingsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_store

    def index
      render json: payload
    end

    def create
      reading = @store.storage_readings.new(reading_params.merge(user: Current.user))
      if reading.save
        render json: payload.merge(reading:), status: :created
      else
        render_errors reading
      end
    end

    def destroy
      @store.storage_readings.find(params[:id]).destroy!
      render json: payload
    end

    private
      def set_store
        @store = @map.features.find_by!(id: params[:feature_id], kind: StorageReading::STORE_KIND)
      end

      def payload
        readings = @store.storage_readings.includes(:user).to_a
        {
          readings: readings.reverse.map(&:as_json),
          summary: StorageClimate.summary(readings),
          ranges: StorageClimate.ranges,
          otherStores: @map.features.where(kind: StorageReading::STORE_KIND).where.not(id: @store.id).where.not(status: "rejected").count
        }
      end

      def reading_params
        params.require(:storage_reading).permit(:measured_on, :temperature_c, :temperature_min_c, :temperature_max_c, :humidity_pct, :note)
      end
  end
end
