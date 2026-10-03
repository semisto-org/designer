# Cadastral parcels → terrain outline.
#
# GET  /maps/:map_id/parcels/lookup?lng=&lat=  the parcel under a click
# POST /maps/:map_id/parcels                   { parcels: [{ capakey, lng, lat }] }
#      unions them into the map boundary and stores their CAPAKEYs.
module Maps
  class ParcelsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_cadastre
    rate_limit to: 120, within: 1.minute, by: -> { Current.user&.id }, only: :lookup,
      with: -> { render json: { message: t("map_data.identify.rate_limited") }, status: :too_many_requests }

    def lookup
      lng, lat = Float(params[:lng]), Float(params[:lat])
      parcel = @cadastre.parcel_at(lng, lat)
      if parcel
        render json: { parcel: }
      else
        render json: { message: t("map_data.parcels.nothing_here") }, status: :not_found
      end
    rescue ArgumentError, TypeError
      render json: { message: t("map_data.identify.invalid") }, status: :unprocessable_entity
    rescue Providers::GeoHttp::Error
      render json: { message: t("map_data.parcels.errors.unreachable") }, status: :service_unavailable
    end

    def create
      parcels = Array(params[:parcels]).select { |p| p.respond_to?(:permit) }
        .map { |p| p.permit(:capakey, :lng, :lat).to_h.symbolize_keys }
      map = Boundaries::ParcelUnion.new(@map, parcels, cadastre: @cadastre).call
      render json: { map: map.as_inertia(Current.user) }
    rescue Boundaries::ParcelUnion::Error => error
      render json: { message: error.message }, status: :unprocessable_entity
    end

    private
      def set_cadastre
        @cadastre = Providers::Cadastre.for(@map.region)
        render json: { message: t("map_data.parcels.errors.unavailable") }, status: :not_found unless @cadastre
      end
  end
end
