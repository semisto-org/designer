# Follow-up of a planted plant: observations (take, vigour, note, photo).
module Maps
  class PlantObservationsController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: %i[index photo]
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

    # /maps/:map_id/features/:feature_id/plant_observations/:id/photo?size=thumb|large
    # A short-lived link to a variant: never the original, whose EXIF block
    # may hold the GPS position.
    def photo
      observation = @plant.plant_observations.find(params[:id])
      link = variant_link(observation, params[:size].presence_in(%w[thumb large]) || "large")
      return head :not_found unless link
      expires_in 4.minutes, private: true
      redirect_to link, allow_other_host: true
    end

    private
      def set_plant
        @plant = @map.features.find_by!(id: params[:feature_id], kind: PlantableFeature::PLANT)
      end

      def observations
        @plant.plant_observations.includes(:user, photo_attachment: :blob).reorder(observed_on: :desc, id: :desc)
      end

      def variant_link(observation, size)
        return unless observation.photo.attached?
        observation.photo.variant(size.to_sym).processed.url(expires_in: 5.minutes, disposition: :inline)
      rescue StandardError => error
        # A file libvips cannot read has no variant, and the original is never served.
        Rails.logger.warn("[plants] no #{size} variant for observation #{observation.id}: #{error.class}: #{error.message}")
        nil
      end

      def observation_params
        params.require(:plant_observation).permit(:observed_on, :survival, :vigor, :note, :photo)
      end
  end
end
