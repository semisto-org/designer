# JSON API used by the map editor: features are GeoJSON Features.
module Maps
  class FeaturesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_feature, only: %i[update destroy]

    def index
      scope = @map.features.where.not(status: "rejected")
      scope = scope.where(layer: params[:layer]) if params[:layer].present?
      render json: { type: "FeatureCollection", features: scope.map(&:as_geojson) }
    end

    def create
      feature = @map.features.new(feature_params.merge(created_by: Current.user, updated_by: Current.user))
      if feature.save
        render json: feature.as_geojson, status: :created
      else
        render_errors feature
      end
    end

    def update
      if @feature.update(feature_params.merge(updated_by: Current.user))
        render json: @feature.as_geojson
      else
        render_errors @feature
      end
    rescue ActiveRecord::StaleObjectError
      render json: { message: t("maps.errors.stale"), feature: @feature.reload.as_geojson }, status: :conflict
    end

    def destroy
      @feature.destroy!
      head :no_content
    end

    private
      def set_feature
        @feature = @map.features.find(params[:id])
      end

      def feature_params
        raw = params.require(:feature)
        permitted = raw.permit(:layer, :kind, :name, :notes, :status, :lock_version, properties: {}, style: {})
        permitted[:geometry] = raw[:geometry].to_unsafe_h if raw[:geometry].present?
        permitted
      end
  end
end
