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
      if @feature.update(update_params.merge(updated_by: Current.user))
        # A renumbered plant that swapped numbers sends the other plant too.
        swapped = @feature.swapped_with
        render json: swapped ? @feature.as_geojson.merge(swapped: swapped.as_geojson) : @feature.as_geojson
      else
        render_errors @feature
      end
    rescue ActiveRecord::StaleObjectError
      render json: { message: t("maps.errors.stale"), feature: @feature.reload.as_geojson }, status: :conflict
    end

    # To the trash: « Annuler » brings it back (restore) for MapFeature::Trash::KEEP_FOR.
    def destroy
      @feature.trash!(by: Current.user)
      head :no_content
    end

    def restore
      feature = @map.features.trashed.find(params[:id])
      feature.restore!(by: Current.user)
      render json: feature.as_geojson
    end

    private
      def set_feature
        @feature = @map.features.find(params[:id])
      end

      def feature_params
        raw = params.require(:feature)
        permitted = raw.permit(:layer, :kind, :name, :notes, :status, :lock_version, :swap_number, properties: {}, style: {}, tags: [])
        permitted[:geometry] = raw[:geometry].to_unsafe_h if raw[:geometry].present?
        permitted
      end

      # properties_patch (the phone app) changes only the keys it names, so an
      # edit made offline never overwrites what changed on the website since.
      def update_params
        permitted = feature_params
        # Free keys, like properties: {} above (the jsonb holds any property).
        patch = params.dig(:feature, :properties_patch)
        return permitted unless patch.respond_to?(:to_unsafe_h)
        permitted.merge(properties: (permitted[:properties] || @feature.properties).to_h.merge(patch.to_unsafe_h))
      end
  end
end
