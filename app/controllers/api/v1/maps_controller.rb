# The phone app's map list and, for one map, everything it keeps offline:
# the map, its layer catalogue, features, photos and planting.
module Api
  module V1
    class MapsController < BaseController
      include MapScoped

      before_action :set_map, only: :show

      def index
        maps = Map.active.where(id: Current.user.map_memberships.select(:map_id))
          .or(Map.active.where(organization_id: Current.user.organization_memberships.select(:organization_id)))
          .includes(:region, :owner).order(updated_at: :desc)
        render json: { maps: maps.map { |m| m.as_inertia(Current.user).merge(readOnlyByPlan: m.read_only_by_plan?) } }
      end

      def show
        render json: {
          map: @map.as_inertia(Current.user).merge(readOnlyByPlan: @map.read_only_by_plan?),
          mapEntitlements: map_entitlements.as_json,
          layers: @map.region.catalogue.enabled.map(&:as_inertia),
          features: @map.features.where.not(status: "rejected").map(&:as_geojson),
          photos: @map.photos.includes(:uploaded_by, image_attachment: :blob).chronological.limit(2000).map(&:as_inertia),
          planting: PlantingState.new(@map),
          syncedAt: Time.current.iso8601
        }
      end
    end
  end
end
