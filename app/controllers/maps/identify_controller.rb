# "What is here?": GET /maps/:map_id/identify?lng=&lat=&zoom=&layers[]=
#
# Asks every requested identifiable layer of the map's region (ArcGIS REST
# identify, in parallel, cached) and answers normalized entries per layer.
# `zoom` sizes the click tolerance; without it, it is derived from the
# viewport (`extent=w,s,e,n` and `size=width,height`).
module Maps
  class IdentifyController < ApplicationController
    include MapScoped

    MAX_LAYERS = 12

    before_action :set_map
    rate_limit to: 60, within: 1.minute, by: -> { Current.user&.id || request.remote_ip },
      with: -> { render json: { message: t("map_data.identify.rate_limited") }, status: :too_many_requests }

    def show
      lng, lat = Float(params[:lng]), Float(params[:lat])
      zoom = requested_zoom
      return render json: { message: t("map_data.identify.invalid") }, status: :unprocessable_entity unless valid?(lng, lat, zoom)

      keys = Array(params[:layers]).map(&:to_s).uniq.first(MAX_LAYERS)
      layers = @map.region.catalogue.enabled.where(key: keys).select(&:identifiable?)
      results = if inside_region?(lng, lat)
        Providers::ArcgisIdentify.new(layers).call(lng:, lat:, zoom:)
      else
        layers.map { |l| Providers::ArcgisIdentify::Result.new(key: l.key, name: l.name, status: "empty", entries: []) }
      end
      render json: { lng:, lat:, results: results.map(&:as_json) }
    rescue ArgumentError, TypeError
      render json: { message: t("map_data.identify.invalid") }, status: :unprocessable_entity
    end

    private
      def requested_zoom
        return Float(params[:zoom]) if params[:zoom].present?
        west, _south, east, _north = params[:extent].to_s.split(",").map { |v| Float(v) }
        width = params[:size].to_s.split(",").first.to_f
        return 17.0 unless west && east && east > west && width.positive?
        Math.log2(360.0 * width / (512 * (east - west)))
      end

      def valid?(lng, lat, zoom)
        lng.between?(-180, 180) && lat.between?(-85, 85) && zoom.finite? && zoom.between?(0, 24)
      end

      def inside_region?(lng, lat)
        bbox = @map.region.as_inertia[:bounds]
        bbox.nil? || (lng.between?(bbox[0], bbox[2]) && lat.between?(bbox[1], bbox[3]))
      end
  end
end
