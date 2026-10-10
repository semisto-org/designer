# « Mettre en image » from the photo viewer: JSON API of PhotoRendering.
# Everyone on the map sees the renderings of a photo; editors ask for one
# (multipart: `input` = the photo flattened with its sketch by the browser,
# `style`, `instructions`, `sketch_id`), then poll `show` until it is done.
#
#   index  200 { available, allowed, remaining, monthlyLimit, renderings: [...] }
#   create 202 rendering
#          403 { code: "plan" }            the owner's plan does not include it
#          422 { code: "invalid", message }
#          429 { code: "monthly_limit" | "rate_limited", message }
#          503 { code: "not_configured", message }
#   show   200 rendering (index and show add `resultPhoto` once done)
module Maps
  class PhotoRenderingsController < ApplicationController
    include MapScoped

    rate_limit to: 10, within: 1.minute, only: :create, by: -> { Current.user&.id },
      with: -> { render json: { code: "rate_limited", message: t("photo_renderings.errors.rate_limited") }, status: :too_many_requests }

    before_action :set_map
    before_action :require_editor!, only: :create
    before_action :set_photo

    def index
      renderings = @photo.renderings.includes(:sketch, :requested_by, result_photo: [ :uploaded_by, { image_attachment: :blob } ]).recent.limit(50)
      render json: availability.merge(renderings: renderings.map { |rendering| rendering_json(rendering) })
    end

    def show
      render json: rendering_json(@photo.renderings.find(params[:id]))
    end

    def create
      return render_refusal("not_configured", :service_unavailable) unless Providers::Magnific.configured?
      return render_refusal("plan", :forbidden) unless Entitlements.for_map(@map).renderings?
      return render_refusal("monthly_limit", :too_many_requests, limit: PhotoRendering::MONTHLY_LIMIT) if remaining <= 0

      rendering = @photo.renderings.new(
        map: @map, requested_by: Current.user, style: params[:style].to_s, instructions: params[:instructions].to_s,
        sketch: params[:sketch_id].present? ? @photo.sketches.find(params[:sketch_id]) : nil
      )
      rendering.input.attach(params[:input]) if params[:input].is_a?(ActionDispatch::Http::UploadedFile)
      if rendering.save
        render json: rendering.as_inertia, status: :accepted
      else
        render json: { code: "invalid", message: rendering.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    private
      def set_photo
        @photo = @map.photos.find(params[:photo_id])
      end

      def rendering_json(rendering)
        json = rendering.as_inertia
        json[:resultPhoto] = rendering.result_photo.as_inertia if rendering.result_photo
        json
      end

      def remaining = PhotoRendering.remaining_this_month(@map.owner)

      def availability
        {
          available: Providers::Magnific.configured?,
          allowed: Entitlements.for_map(@map).renderings?,
          remaining:, monthlyLimit: PhotoRendering::MONTHLY_LIMIT
        }
      end

      def render_refusal(code, status, **options)
        render json: { code:, message: t("photo_renderings.errors.#{code}", **options) }, status:
      end
  end
end
