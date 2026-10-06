# Plan images of a map (« Fonds de plan »): JSON API of the editor's panel.
# Everyone on the map sees them; editors upload, place, show or hide them.
# The file never leaves through a public URL: `image` checks the role on the
# map, then redirects to a short-lived link.
module Maps
  class PlanImagesController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: %i[index image]
    before_action :set_plan_image, only: %i[update destroy image]

    LINK_LIFETIME = 5.minutes

    def index
      render json: { planImages: list }
    end

    def create
      plan_image = @map.plan_images.new(plan_image_params.merge(created_by: Current.user))
      if plan_image.save
        render json: { planImage: plan_image.as_inertia, planImages: list }, status: :created
      else
        render_errors plan_image
      end
    end

    def update
      if @plan_image.update(plan_image_params.except(:image))
        render json: { planImage: @plan_image.as_inertia, planImages: list }
      else
        render_errors @plan_image
      end
    end

    def destroy
      @plan_image.destroy!
      render json: { planImages: list }
    end

    # The image for the map: a variant at most PlanImage::DISPLAY_SIZE wide,
    # or the original when libvips cannot read it.
    def image
      attachment = @plan_image.image
      return head :not_found unless attachment.attached?
      target = begin
        attachment.variant(:display).processed
      rescue StandardError => error
        Rails.logger.warn("[plan_images] no display variant for plan image #{@plan_image.id}: #{error.class}: #{error.message}")
        attachment
      end
      expires_in LINK_LIFETIME - 1.minute, private: true
      redirect_to target.url(expires_in: LINK_LIFETIME, disposition: :inline), allow_other_host: true
    end

    private
      def set_plan_image
        @plan_image = @map.plan_images.find(params[:id])
      end

      def list
        @map.plan_images.reload.map(&:as_inertia)
      end

      def plan_image_params
        params.require(:plan_image).permit(:image, :name, :center_lng, :center_lat, :width_m, :rotation, :aspect, :opacity, :visible)
      end
  end
end
